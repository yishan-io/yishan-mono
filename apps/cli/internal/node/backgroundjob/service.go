// Package backgroundjob is the Node application service for backgroundJob.* RPCs.
package backgroundjob

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	domain "yishan/apps/cli/internal/backgroundjob"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// WorkspaceResolver resolves authoritative open local workspaces.
type WorkspaceResolver interface {
	GetWorkspace(string) (workspace.Workspace, error)
}

// Jobs owns durable background-job persistence and execution.
type Jobs interface {
	Create(context.Context, domain.Job) (domain.Job, error)
	Get(context.Context, string) (domain.Job, error)
	ListByWorkspace(context.Context, string) ([]domain.Job, error)
	Cancel(context.Context, string) error
	Schedule(context.Context, string) error
}

// Deps are the explicit dependencies of the background-job application service.
type Deps struct {
	Jobs            Jobs
	Workspaces      WorkspaceResolver
	OwnerNodeID     string
	IsDSHConfigured func() bool
	IsDSHReady      func() bool
}

// Service validates public requests and derives all execution context locally.
type Service struct{ deps Deps }

// NewService builds the background-job application service.
func NewService(deps Deps) *Service { return &Service{deps: deps} }

// Create persists a local DSH job and starts it only when DSH is ready.
func (s *Service) Create(ctx context.Context, req rpc.BackgroundJobCreateParams) (any, error) {
	if err := validateCreate(req); err != nil {
		return nil, err
	}
	if s.deps.IsDSHConfigured == nil || !s.deps.IsDSHConfigured() {
		return nil, dshUnavailableError()
	}
	workspaceEntry, err := s.workspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	created, err := s.deps.Jobs.Create(ctx, newJob(req, workspaceEntry, s.deps.OwnerNodeID))
	if err != nil {
		return nil, err
	}
	if s.deps.IsDSHReady != nil && s.deps.IsDSHReady() {
		s.schedule(created.ID)
	}
	return domain.PublicJobFrom(created), nil
}

// Get returns a job after authorizing its open workspace.
func (s *Service) Get(ctx context.Context, req rpc.BackgroundJobGetParams) (any, error) {
	job, err := s.job(ctx, req.WorkspaceID, req.JobID)
	if err != nil {
		return nil, err
	}
	return domain.PublicJobFrom(job), nil
}

// List returns bounded jobs for one authoritative open workspace.
func (s *Service) List(ctx context.Context, req rpc.BackgroundJobListParams) (any, error) {
	workspaceEntry, err := s.workspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	jobs, err := s.deps.Jobs.ListByWorkspace(ctx, req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return publicJobs(filterOwnedJobs(jobs, workspaceEntry, s.deps.OwnerNodeID)), nil
}

// Cancel idempotently requests cancellation after workspace authorization.
func (s *Service) Cancel(ctx context.Context, req rpc.BackgroundJobCancelParams) (any, error) {
	job, err := s.job(ctx, req.WorkspaceID, req.JobID)
	if err != nil {
		return nil, err
	}
	if err := s.deps.Jobs.Cancel(ctx, job.ID); err != nil {
		return nil, err
	}
	cancelled, err := s.deps.Jobs.Get(ctx, job.ID)
	if err != nil {
		return nil, err
	}
	return domain.PublicJobFrom(cancelled), nil
}

func (s *Service) schedule(jobID string) {
	if err := s.deps.Jobs.Schedule(context.Background(), jobID); err != nil {
		log.Warn().Err(err).Str("jobId", jobID).Msg("schedule persisted background job for durable retry")
	}
}

func (s *Service) workspace(workspaceID string) (workspace.Workspace, error) {
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(workspaceID) != workspaceID {
		return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeInvalidParams, "workspaceId is required")
	}
	return s.deps.Workspaces.GetWorkspace(workspaceID)
}

func (s *Service) job(ctx context.Context, workspaceID, jobID string) (domain.Job, error) {
	workspaceEntry, err := s.workspace(workspaceID)
	if err != nil {
		return domain.Job{}, err
	}
	if strings.TrimSpace(jobID) == "" || strings.TrimSpace(jobID) != jobID {
		return domain.Job{}, rpc.NewRPCError(rpc.CodeInvalidParams, "jobId is required")
	}
	job, err := s.deps.Jobs.Get(ctx, jobID)
	if err != nil || !isOwnedJob(job, workspaceEntry, s.deps.OwnerNodeID) {
		return domain.Job{}, domain.ErrJobNotFound
	}
	return job, nil
}

func validateCreate(req rpc.BackgroundJobCreateParams) error {
	for _, field := range []string{req.WorkspaceID, req.Prompt, req.Model} {
		if strings.TrimSpace(field) == "" || strings.TrimSpace(field) != field {
			return rpc.NewRPCError(rpc.CodeInvalidParams, "workspaceId, prompt, and model are required")
		}
	}
	return nil
}

func newJob(req rpc.BackgroundJobCreateParams, workspaceEntry workspace.Workspace, ownerNodeID string) domain.Job {
	id := uuid.NewString()
	return domain.Job{ID: id, Kind: domain.KindWorkspaceTaskRun, Runtime: domain.RuntimeDSH,
		WorkspaceID: workspaceEntry.ID, ProjectID: workspaceEntry.ProjectID, OrganizationID: workspaceEntry.OrgID,
		OwnerNodeID: ownerNodeID, SessionID: "job-" + id, CWD: workspaceEntry.Path, Prompt: req.Prompt,
		Model: req.Model, Status: domain.StatusQueued}
}

func filterOwnedJobs(jobs []domain.Job, workspaceEntry workspace.Workspace, ownerNodeID string) []domain.Job {
	owned := make([]domain.Job, 0, len(jobs))
	for _, job := range jobs {
		if isOwnedJob(job, workspaceEntry, ownerNodeID) {
			owned = append(owned, job)
		}
	}
	return owned
}

func isOwnedJob(job domain.Job, workspaceEntry workspace.Workspace, ownerNodeID string) bool {
	return job.OwnerNodeID == ownerNodeID && job.WorkspaceID == workspaceEntry.ID &&
		job.ProjectID == workspaceEntry.ProjectID && job.OrganizationID == workspaceEntry.OrgID && job.CWD == workspaceEntry.Path
}

func publicJobs(jobs []domain.Job) rpc.BackgroundJobListResult {
	result := rpc.BackgroundJobListResult{Jobs: make([]rpc.BackgroundJobResult, 0, len(jobs))}
	for _, job := range jobs {
		result.Jobs = append(result.Jobs, domain.PublicJobFrom(job))
	}
	return result
}

func dshUnavailableError() error {
	return rpc.NewRPCErrorWithData(rpc.CodeToolUnavailable, "DSH runtime is unavailable", map[string]any{
		"code": rpc.ErrorDataCodeDSHRuntimeUnavailable,
	})
}
