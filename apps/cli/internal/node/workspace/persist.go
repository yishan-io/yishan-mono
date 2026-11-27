package workspace

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/events"
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

	s.deps.Events.Publish(eventbus.Event{
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
	row := sqlite.ProvisioningRow(*prepared.Registration)
	return sqlite.NewWorkspaceStore(s.deps.Database).Create(ctx, &row)
}

// Finalize transitions the persisted row to active once the local worktree
// has been provisioned. A missing row (a direct create without project
// registration) is tolerated.
func (s *Service) Finalize(ctx context.Context, prepared application.CreatePlan, created workspace.Workspace) error {
	if s.deps.Database == nil || prepared.Registration == nil {
		return nil
	}
	err := sqlite.NewWorkspaceStore(s.deps.Database).Update(ctx, created.ID, sqlite.ActiveUpdate(created))
	if err != nil && !errors.Is(err, sqlite.ErrWorkspaceNotFound) {
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
	err := sqlite.NewWorkspaceStore(s.deps.Database).Update(ctx, workspaceID, sqlite.StateUpdate(state, health))
	if err != nil && !errors.Is(err, sqlite.ErrWorkspaceNotFound) {
		return err
	}
	return nil
}

// MarkClosed marks the workspace record closed.
func (s *Service) MarkClosed(ctx context.Context, workspaceID string) error {
	if s.deps.Database == nil || strings.TrimSpace(workspaceID) == "" {
		return nil
	}
	err := sqlite.NewWorkspaceStore(s.deps.Database).Update(ctx, workspaceID, sqlite.StatusUpdate(string(workspace.StatusClosed)))
	if err != nil && !errors.Is(err, sqlite.ErrWorkspaceNotFound) {
		return err
	}
	return nil
}

// persistOpenedProjectPath updates only the local overlay and recovered health.
// Snapshot-only entries may not have a local row yet.
func (s *Service) persistOpenedProjectPath(ctx context.Context, workspaceID, path string) error {
	if s.deps.Database == nil {
		return nil
	}
	state, health := string(workspace.StateActive), ""
	err := sqlite.NewWorkspaceStore(s.deps.Database).Update(ctx, workspaceID, sqlite.WorkspaceUpdate{
		LocalPath: &path, State: &state, Health: &health,
	})
	if err != nil && !errors.Is(err, sqlite.ErrWorkspaceNotFound) {
		return fmt.Errorf("persist opened workspace path: %w", err)
	}
	return nil
}
