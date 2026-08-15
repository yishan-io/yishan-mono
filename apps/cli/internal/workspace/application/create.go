package application

import (
	"context"

	"yishan/apps/cli/internal/workspace"
)

// executePlan runs the create engine for a prepared plan. This is the
// single place that decides the execution path (relay dispatch vs local
// provision) and the rollback policy on failure.
func (s *Service) executePlan(ctx context.Context, prepared CreatePlan) {
	ExecutePreparedPlan(ctx, PreparedPlan{
		WorkspaceID:   prepared.WorkspaceID,
		LocalCreate:   prepared.LocalCreate,
		RemoteRequest: (*CreateCommand)(prepared.RemoteRequest),
	}, ExecutePreparedPlanDependencies{
		Now: s.deps.Now,
		DispatchRemote: func(req CreateCommand) error {
			command := CreateCommand(req)
			return s.deps.Relay.DispatchCreate(ctx, prepared, command)
		},
		RollbackRegistration: func(ctx context.Context) {
			s.rollbackRegistration(ctx, prepared)
		},
		ExecuteLocalCreate: func(ctx context.Context, report workspace.CreateProgressReporter) error {
			return s.executeLocalCreate(ctx, prepared, report)
		},
		PublishProgress: func(event workspace.CreateProgressEvent) {
			s.deps.Events.CreateProgress(prepared, event)
		},
		PublishFailed: func(failed FailedEvent) {
			s.deps.Events.CreateFailed(prepared, failed)
		},
	})
}

// executeLocalCreate runs the local provision pipeline and its finalize
// step (watcher registration, local+cloud record finalization, completion).
func (s *Service) executeLocalCreate(ctx context.Context, prepared CreatePlan, reportProgress workspace.CreateProgressReporter) error {
	return ExecuteLocalCreate(ctx, prepared.WorkspaceID, *prepared.LocalCreate, ExecuteLocalCreateDependencies{
		Now: s.deps.Now,
		CreateWorkspaceWithProgress: func(ctx context.Context, req workspace.CreateRequest, report workspace.CreateProgressReporter) (workspace.Workspace, error) {
			return s.deps.Instances.CreateWorkspaceWithProgress(ctx, req, report)
		},
		RollbackRegistration: func(ctx context.Context) {
			s.rollbackRegistration(ctx, prepared)
		},
		FinalizeLocalCreate: func(ctx context.Context, created workspace.Workspace) error {
			s.deps.Instances.WatchAndTrack(created.ID, created.Path)
			if err := s.deps.Records.FinalizePersisted(ctx, prepared, created); err != nil {
				s.rollbackCreateFailure(ctx, prepared, created)
				return err
			}
			if prepared.Registration != nil {
				s.deps.Records.UpdateRemoteRecord(ctx, *prepared.Registration, created.Path)
			}
			s.deps.Events.SnapshotChanged(prepared.OrganizationID, prepared.ProjectID, created.ID, "updated")
			return nil
		},
		PublishProgress: reportProgress,
		PublishCompleted: func(created workspace.Workspace) {
			warnings := []any{}
			if s.deps.HookWarnings != nil {
				warnings = s.deps.HookWarnings(prepared.LocalCreate.SetupHook, created.SetupHookResult)
			}
			s.deps.Events.CreateCompleted(prepared, created, warnings)
		},
	}, reportProgress)
}

// rollbackRegistration closes the local row and the cloud record when a create
// fails before a worktree exists (dispatch rejection, provision step failure).
func (s *Service) rollbackRegistration(ctx context.Context, prepared CreatePlan) {
	if err := s.deps.Records.ClosePersisted(ctx, prepared.WorkspaceID); err != nil {
		return
	}
	s.closeRemoteRecordForRegistration(ctx, prepared)
}

// rollbackCreateFailure rolls back a create that reached finalize: closes the
// records and tears down the partially created worktree.
func (s *Service) rollbackCreateFailure(ctx context.Context, prepared CreatePlan, created workspace.Workspace) {
	if err := s.deps.Records.ClosePersisted(ctx, prepared.WorkspaceID); err != nil {
		return
	}
	s.closeRemoteRecordForRegistration(ctx, prepared)

	closeReq := BuildCreateFailureClosePathRequest(created, prepared.LocalCreate.TargetBranch)
	s.cleanupCreateFailure(ctx, closeReq)
}

// closeRemoteRecordForRegistration marks the cloud record closed from the
// prepared registration rather than a local row lookup: the origin of a
// remote-target create has no local row, so without this the remote
// provisioning record would leak on dispatch failure.
func (s *Service) closeRemoteRecordForRegistration(ctx context.Context, prepared CreatePlan) {
	if prepared.Registration == nil {
		return
	}
	registration := prepared.Registration
	s.deps.Records.CloseRemoteRecord(ctx, registration.OrganizationID, registration.ProjectID, registration.ID, workspace.StatusClosed)
}

// cleanupCreateFailure tears down a partially created worktree and clears the
// runtime record, wiring the daemon's side-effect hooks into createflow.
func (s *Service) cleanupCreateFailure(ctx context.Context, closeReq workspace.ClosePathRequest) {
	CleanupLocalWorkspaceCreateFailure(ctx, CleanupDependencies{
		Unwatch:      s.deps.Instances.Unwatch,
		StopTracking: s.deps.Instances.StopTracking,
		RegisterCleanup: func(req workspace.ClosePathRequest) error {
			if s.deps.RegisterCleanup == nil {
				return nil
			}
			return s.deps.RegisterCleanup(CleanupRequest{
				WorkspaceID: req.WorkspaceID, Path: req.Path, Branch: req.Branch,
				RemoveBranch: req.RemoveBranch, ForceWorktree: req.ForceWorktree,
				ForceBranch: req.ForceBranch, PostHook: req.PostHook,
			})
		},
		CloseWorkspacePath: func(ctx context.Context, req workspace.ClosePathRequest) error {
			_, err := s.deps.Instances.CloseWorkspacePath(ctx, req)
			return err
		},
		MarkCleanupFailure: func(workspaceID string, cleanupErr error) error {
			if s.deps.MarkCleanupFailure == nil {
				return nil
			}
			return s.deps.MarkCleanupFailure(workspaceID, cleanupErr)
		},
		RemoveRegisteredCleanup: func(workspaceID string) error {
			if s.deps.RemoveCleanup == nil {
				return nil
			}
			return s.deps.RemoveCleanup(workspaceID)
		},
		RemoveWorkspaceFromMemory: s.deps.Instances.RemoveFromMemory,
		ClearAgentUsage: func(workspaceID string) {
			if s.deps.ClearAgentUsage != nil {
				s.deps.ClearAgentUsage(workspaceID)
			}
		},
		Warn: s.deps.Warn,
	}, closeReq)
}
