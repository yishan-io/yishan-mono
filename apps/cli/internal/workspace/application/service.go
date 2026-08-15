package application

import (
	"context"

	"github.com/rs/zerolog/log"
)

// Service is the single owner of workspace create/close orchestration. The
// JSON-RPC handler decodes input, calls one Service method, and encodes the
// output; routing (local vs remote node) and rollback policy live here.
type Service struct {
	deps Dependencies
}

// New wires a Service. The daemon provides the ports and hooks; tests provide
// fakes for the same interfaces.
func New(deps Dependencies) *Service {
	return &Service{deps: deps}
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
	if err := s.register(ctx, prepared); err != nil {
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

	return CreateResult{ID: prepared.WorkspaceID, Status: "pending"}, nil
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
	prepared, err := s.prepare(ctx, command)
	if err != nil {
		return err
	}
	if err := s.register(ctx, prepared); err != nil {
		return err
	}
	go s.execute(context.Background(), prepared)
	return nil
}

func (s *Service) execute(ctx context.Context, prepared CreatePlan) {
	defer func() {
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Str("workspaceId", prepared.WorkspaceID).Msg("panic in workspace create execution")
		}
	}()
	s.executePlan(ctx, prepared)
}
