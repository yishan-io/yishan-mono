// Package scheduledjob is the Node application service for the scheduledJob.*
// RPC namespace. Scheduled jobs run on the daemon that owns them: definitions
// and runs live in the local database, the local scheduler claims due
// occurrences from it, and runs execute an agent in the project's primary
// checkout on this node.
package scheduledjob

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	domain "yishan/apps/cli/internal/scheduledjob"

	"github.com/google/uuid"
)

// RunAgentFunc runs one agent prompt in projectPath and returns its output.
type RunAgentFunc func(ctx context.Context, agentKind, prompt, model, projectPath string) (string, error)

// Deps are the explicit dependencies of the scheduled job service.
type Deps struct {
	Database *sql.DB
	// NodeID identifies this daemon; jobs only run on their own node.
	NodeID string
	// Session is used only by the one-time import from api-service.
	Session *session.Session
	// EnsureProjectsImported imports an organization's projects first, so
	// imported jobs find their project.
	EnsureProjectsImported func(ctx context.Context, organizationID string)
	// RunAgent executes a run's agent.
	RunAgent RunAgentFunc
	// ScheduleChanged tells the scheduler to re-read the active jobs.
	ScheduleChanged func()
	// LaunchRun executes a manual run in the background, bound to the
	// daemon's lifetime.
	LaunchRun func(Claim)
	Now       func() time.Time
}

// Service implements the scheduledJob.* RPC namespace and the scheduler
// callbacks.
type Service struct {
	deps Deps
}

// NewService builds the scheduled job service.
func NewService(deps Deps) *Service {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &Service{deps: deps}
}

// SetRuntime attaches the scheduler hooks, which are composed after the
// service.
func (s *Service) SetRuntime(scheduleChanged func(), launchRun func(Claim)) {
	s.deps.ScheduleChanged, s.deps.LaunchRun = scheduleChanged, launchRun
}

func (s *Service) store() *sqlite.ScheduledJobStore {
	return sqlite.NewScheduledJobStore(s.deps.Database)
}

func (s *Service) now() time.Time {
	return s.deps.Now().UTC()
}

func (s *Service) scheduleChanged() {
	if s.deps.ScheduleChanged != nil {
		s.deps.ScheduleChanged()
	}
}

// List returns an organization's jobs.
func (s *Service) List(ctx context.Context, req rpc.ScheduledJobListParams) (any, error) {
	if strings.TrimSpace(req.OrganizationID) == "" {
		return nil, invalidParams("organizationId is required")
	}
	return s.store().ListJobs(ctx, req.OrganizationID, strings.TrimSpace(req.ProjectID))
}

// Create adds a job for a project of this node and schedules its first run.
func (s *Service) Create(ctx context.Context, req rpc.ScheduledJobCreateParams) (any, error) {
	if err := s.requireLocalNode(req.NodeID); err != nil {
		return nil, err
	}
	if err := s.requireProject(ctx, req.OrganizationID, req.ProjectID); err != nil {
		return nil, err
	}
	definition, err := domain.Definition{Name: req.Name, AgentKind: req.AgentKind, Prompt: req.Prompt, Model: req.Model,
		Command: req.Command, CronExpression: req.CronExpression, Timezone: req.Timezone}.Normalize()
	if err != nil {
		return nil, invalidParams(err.Error())
	}
	now := s.now()
	job := domain.Job{ID: uuid.Must(uuid.NewV7()).String(), OrganizationID: req.OrganizationID, ProjectID: req.ProjectID,
		NodeID: s.deps.NodeID, Status: domain.StatusActive, CreatedAt: domain.FormatTime(now), UpdatedAt: domain.FormatTime(now)}
	applyDefinition(&job, definition)
	if err := s.scheduleNext(&job, now); err != nil {
		return nil, err
	}
	if err := s.store().CreateJob(ctx, job); err != nil {
		return nil, err
	}
	s.scheduleChanged()
	return job, nil
}

// Update edits a job's definition. The next run is recomputed when the
// schedule changed or the job is active.
func (s *Service) Update(ctx context.Context, req rpc.ScheduledJobUpdateParams) (any, error) {
	job, err := s.ownedJob(ctx, req.OrganizationID, req.JobID)
	if err != nil {
		return nil, err
	}
	if req.NodeID != nil {
		if err := s.requireLocalNode(*req.NodeID); err != nil {
			return nil, err
		}
	}
	definition, err := mergeDefinition(job, req).Normalize()
	if err != nil {
		return nil, invalidParams(err.Error())
	}
	scheduleChanged := definition.CronExpression != job.CronExpression || definition.Timezone != job.Timezone
	applyDefinition(&job, definition)
	if scheduleChanged || job.Status == domain.StatusActive {
		if err := s.scheduleNext(&job, s.now()); err != nil {
			return nil, err
		}
	}
	return s.save(ctx, job)
}

// Pause stops a job from being scheduled; manual runs stay possible.
func (s *Service) Pause(ctx context.Context, req rpc.ScheduledJobRefParams) (any, error) {
	job, err := s.ownedJob(ctx, req.OrganizationID, req.JobID)
	if err != nil {
		return nil, err
	}
	job.Status = domain.StatusPaused
	return s.save(ctx, job)
}

// Resume reactivates a job from its next future occurrence.
func (s *Service) Resume(ctx context.Context, req rpc.ScheduledJobRefParams) (any, error) {
	job, err := s.ownedJob(ctx, req.OrganizationID, req.JobID)
	if err != nil {
		return nil, err
	}
	job.Status = domain.StatusActive
	if err := s.scheduleNext(&job, s.now()); err != nil {
		return nil, err
	}
	return s.save(ctx, job)
}

// Delete removes a job and its runs.
func (s *Service) Delete(ctx context.Context, req rpc.ScheduledJobRefParams) (any, error) {
	job, err := s.ownedJob(ctx, req.OrganizationID, req.JobID)
	if err != nil {
		return nil, err
	}
	if err := s.store().DeleteJob(ctx, job.ID); err != nil {
		return nil, toRPCError(err, job.ID)
	}
	s.scheduleChanged()
	return map[string]bool{"ok": true}, nil
}

func (s *Service) save(ctx context.Context, job domain.Job) (any, error) {
	job.UpdatedAt = domain.FormatTime(s.now())
	if err := s.store().SaveJob(ctx, job); err != nil {
		return nil, toRPCError(err, job.ID)
	}
	s.scheduleChanged()
	return job, nil
}

func (s *Service) scheduleNext(job *domain.Job, from time.Time) error {
	next, err := domain.NextRunAt(job.CronExpression, job.Timezone, from)
	if err != nil {
		return invalidParams(err.Error())
	}
	job.NextRunAt = domain.FormatTime(next)
	return nil
}

func applyDefinition(job *domain.Job, definition domain.Definition) {
	job.Name, job.AgentKind, job.Prompt = definition.Name, definition.AgentKind, definition.Prompt
	job.Model, job.Command = definition.Model, definition.Command
	job.CronExpression, job.Timezone = definition.CronExpression, definition.Timezone
}

func mergeDefinition(job domain.Job, req rpc.ScheduledJobUpdateParams) domain.Definition {
	definition := domain.Definition{Name: job.Name, AgentKind: job.AgentKind, Prompt: job.Prompt, Model: job.Model,
		Command: job.Command, CronExpression: job.CronExpression, Timezone: job.Timezone}
	for _, field := range []struct {
		value  *string
		target *string
	}{
		{req.Name, &definition.Name}, {req.AgentKind, &definition.AgentKind}, {req.Prompt, &definition.Prompt},
		{req.CronExpression, &definition.CronExpression}, {req.Timezone, &definition.Timezone},
	} {
		if field.value != nil {
			*field.target = *field.value
		}
	}
	if req.Model.Set {
		definition.Model = req.Model.Value
	}
	if req.Command.Set {
		definition.Command = req.Command.Value
	}
	return definition
}

func (s *Service) requireLocalNode(nodeID string) error {
	if trimmed := strings.TrimSpace(nodeID); trimmed != "" && trimmed != s.deps.NodeID {
		return invalidParams("scheduled jobs run on the machine that owns them; nodeId must be this daemon's node")
	}
	return nil
}

func (s *Service) requireProject(ctx context.Context, organizationID string, projectID string) error {
	if strings.TrimSpace(organizationID) == "" || strings.TrimSpace(projectID) == "" {
		return invalidParams("organizationId and projectId are required")
	}
	project, err := sqlite.NewProjectStore(s.deps.Database).Get(ctx, projectID)
	if errors.Is(err, sqlite.ErrProjectNotFound) || (err == nil && project.OrganizationID != organizationID) {
		return rpc.NewRPCError(rpc.CodeNotFound, "project not found: "+projectID)
	}
	return err
}

// ownedJob loads a job and checks it belongs to organizationID.
func (s *Service) ownedJob(ctx context.Context, organizationID string, jobID string) (domain.Job, error) {
	job, err := s.store().GetJob(ctx, strings.TrimSpace(jobID))
	if err != nil {
		return domain.Job{}, toRPCError(err, jobID)
	}
	if strings.TrimSpace(organizationID) != "" && job.OrganizationID != organizationID {
		return domain.Job{}, toRPCError(domain.ErrJobNotFound, jobID)
	}
	return job, nil
}

func invalidParams(message string) error {
	return rpc.NewRPCError(rpc.CodeInvalidParams, message)
}

func toRPCError(err error, jobID string) error {
	if errors.Is(err, domain.ErrJobNotFound) {
		return rpc.NewRPCError(rpc.CodeNotFound, "scheduled job not found: "+jobID)
	}
	if err != nil {
		return fmt.Errorf("scheduled job %q: %w", jobID, err)
	}
	return nil
}
