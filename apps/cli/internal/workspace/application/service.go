package application

import (
	"context"
	"fmt"
	"sync"

	"github.com/rs/zerolog/log"
)

// Service is the single owner of workspace create/close orchestration. The
// JSON-RPC handler decodes input, calls one Service method, and encodes the
// output; routing (local vs remote node) and rollback policy live here.
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

// Create handles a workspace.create request on the origin node: prepare →
// register (local row) → cloud record → created events → async execution.
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
	// Write the cloud record (provisioning) before provisioning or dispatching,
	// so the same create→provision→activate→close lifecycle is node-agnostic.
	if prepared.Registration != nil {
		s.deps.Records.CreateRemoteRecord(ctx, *prepared.Registration)
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

// register persists the local SQLite row for local creates. A remote-target
// create is forwarded to the executor node, which owns the worktree and its
// local runtime record: the origin only relays and must not write a local row.
func (s *Service) register(ctx context.Context, prepared CreatePlan) error {
	if prepared.Registration == nil || prepared.RemoteRequest != nil {
		return nil
	}
	return s.deps.Records.PersistPrepared(ctx, prepared)
}

// ExecuteRelayed handles a create relayed from another node (executor side):
// prepare → register → async execution, without the origin-side created events.
func (s *Service) ExecuteRelayed(ctx context.Context, command CreateCommand) error {
	// The origin owns the Local Task association. The executor must not alter
	// a task database that may be unrelated to the originating task.
	command.LocalTaskID = ""
	prepared, err := s.prepare(ctx, command)
	if err != nil {
		return err
	}
	shouldReleaseReservation := true
	defer func() {
		if shouldReleaseReservation {
			s.releaseCreateReservation(prepared)
		}
	}()
	if err := s.register(ctx, prepared); err != nil {
		return err
	}
	go s.execute(context.Background(), prepared)
	shouldReleaseReservation = false
	return nil
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
