package application

import (
	"context"
	"fmt"
	"sync"

	"github.com/rs/zerolog/log"
)

// Service is the single owner of workspace create/close orchestration. The
// JSON-RPC handler decodes input, calls one Service method, and encodes the
// output; rollback policy lives here.
type Service struct {
	deps Dependencies

	createMu               sync.Mutex
	reservedCreateNames    map[string]struct{}
	reservedCreateBranches map[string]struct{}
}

// New wires a Service. The daemon provides the dependencies and hooks; tests provide
// fakes for the same interfaces.
func New(deps Dependencies) *Service {
	return &Service{
		deps: deps, reservedCreateNames: make(map[string]struct{}), reservedCreateBranches: make(map[string]struct{}),
	}
}

// Create handles a workspace.create request: prepare → register (local row)
// → created events → async execution.
// The synchronous part mirrors today's handleWorkspaceCreate; the goroutine
// mirrors executeWorkspaceCreate.
func (s *Service) Create(ctx context.Context, command CreateCommand) (CreateResult, error) {
	prepared, err := s.prepare(ctx, command)
	if err != nil {
		return CreateResult{}, err
	}
	shouldReleaseReservation := true
	defer func() {
		if shouldReleaseReservation {
			s.releaseCreateReservation(prepared)
		}
	}()
	if err := s.register(ctx, prepared); err != nil {
		return CreateResult{}, err
	}
	if err := s.linkLocalTaskWorkspace(ctx, prepared); err != nil {
		s.rollbackRegistration(ctx, prepared)
		return CreateResult{}, err
	}
	s.deps.Events.SnapshotChanged(prepared.OrganizationID, prepared.ProjectID, prepared.WorkspaceID, "created")
	s.deps.Events.CreateStarted(prepared.StartedEvent)

	go s.execute(context.Background(), prepared)
	shouldReleaseReservation = false

	return CreateResult{
		ID: prepared.WorkspaceID, Status: "pending",
		WorkspaceName: prepared.StartedEvent.WorkspaceName, Branch: prepared.StartedEvent.Branch,
	}, nil
}

func (s *Service) linkLocalTaskWorkspace(ctx context.Context, prepared CreatePlan) error {
	if prepared.LocalTaskID == "" {
		return nil
	}
	if s.deps.LinkLocalTaskWorkspace == nil {
		return fmt.Errorf("local task workspace linking is unavailable")
	}
	return s.deps.LinkLocalTaskWorkspace(ctx, prepared.LocalTaskID, prepared.WorkspaceID)
}

func (s *Service) unlinkLocalTaskWorkspace(ctx context.Context, prepared CreatePlan) {
	if prepared.LocalTaskID == "" || s.deps.UnlinkLocalTaskWorkspace == nil {
		return
	}
	_ = s.deps.UnlinkLocalTaskWorkspace(ctx, prepared.WorkspaceID) // best-effort rollback; the create failure is authoritative
}

// register persists the local SQLite row for the create.
func (s *Service) register(ctx context.Context, prepared CreatePlan) error {
	if prepared.Registration == nil {
		return nil
	}
	return s.deps.Records.PersistPrepared(ctx, prepared)
}

func (s *Service) execute(ctx context.Context, prepared CreatePlan) {
	defer func() {
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Str("workspaceId", prepared.WorkspaceID).Msg("panic in workspace create execution")
		}
	}()
	defer s.releaseCreateReservation(prepared)
	s.executePlan(ctx, prepared)
}
