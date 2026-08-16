package workspace

import (
	"context"
	"errors"
	"strings"

	localdb "yishan/apps/cli/internal/db"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

// PublishWorkspaceSnapshotChanged emits the snapshot-changed frontend event
// that drives the desktop's workspace list refresh.
func (s *Service) PublishSnapshotChanged(organizationID string, projectID string, workspaceID string, change string) {
	if strings.TrimSpace(organizationID) == "" || strings.TrimSpace(projectID) == "" || strings.TrimSpace(workspaceID) == "" {
		return
	}
	if s.deps.Events == nil {
		return
	}

	s.deps.Events.Publish(internalevents.Event{
		Topic: "workspaceSnapshotChanged",
		Payload: map[string]any{
			"organizationId": organizationID,
			"resource":       "workspace",
			"change":         change,
			"projectId":      projectID,
			"workspaceId":    workspaceID,
		},
	})
}

// PersistPrepared writes the provisioning row for a prepared create before the
// worktree is provisioned, so the workspace survives a crash mid-create.
func (s *Service) PersistPlan(ctx context.Context, prepared application.CreatePlan) error {
	if s.deps.Database == nil || prepared.Registration == nil {
		return nil
	}
	row := localdb.ProvisioningRow(*prepared.Registration)
	return localdb.NewWorkspaceStore(s.deps.Database).Create(ctx, &row)
}

// FinalizePersisted transitions the persisted row to active once the local
// worktree has been provisioned. A relayed create runs on the executor node,
// which may not have a local row for the workspace (the origin node wrote it);
// a missing row is tolerated because the remote record is authoritative and
// the cache is reconciled on the next sync.
func (s *Service) Finalize(ctx context.Context, prepared application.CreatePlan, created workspace.Workspace) error {
	if s.deps.Database == nil || prepared.Registration == nil {
		return nil
	}
	err := localdb.NewWorkspaceStore(s.deps.Database).Update(ctx, created.ID, localdb.ActiveUpdate(created))
	if err != nil && !errors.Is(err, localdb.ErrWorkspaceNotFound) {
		return err
	}
	return nil
}

// UpdatePersistedWorkspaceState writes the runtime state/health to the local
// row.
func (s *Service) UpdateState(ctx context.Context, workspaceID string, state string, health string) error {
	if s.deps.Database == nil || strings.TrimSpace(workspaceID) == "" {
		return nil
	}
	err := localdb.NewWorkspaceStore(s.deps.Database).Update(ctx, workspaceID, localdb.StateUpdate(state, health))
	if err != nil && !errors.Is(err, localdb.ErrWorkspaceNotFound) {
		return err
	}
	return nil
}

// ClosePersisted marks the workspace record closed locally and mirrors the
// closed status on the remote record (best-effort).
func (s *Service) MarkClosed(ctx context.Context, workspaceID string) error {
	if s.deps.Database == nil || strings.TrimSpace(workspaceID) == "" {
		return nil
	}
	workspaceStore := localdb.NewWorkspaceStore(s.deps.Database)
	if err := workspaceStore.Update(ctx, workspaceID, localdb.StatusUpdate(string(workspace.StatusClosed))); err != nil && !errors.Is(err, localdb.ErrWorkspaceNotFound) {
		return err
	}
	// Mirror the closed status on the remote record (best-effort). The local row
	// still carries the org/project ids after the status update.
	if record, err := workspaceStore.Get(ctx, workspaceID); err == nil {
		s.CloseRecord(ctx, record.OrganizationID, record.ProjectID, workspaceID, string(workspace.StatusClosed))
	}
	return nil
}
