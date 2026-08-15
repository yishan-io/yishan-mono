package daemon

import (
	"context"
	"errors"
	"strings"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/dbconv"
	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) publishWorkspaceSnapshotChanged(organizationID string, projectID string, workspaceID string, change string) {
	if strings.TrimSpace(organizationID) == "" || strings.TrimSpace(projectID) == "" || strings.TrimSpace(workspaceID) == "" {
		return
	}

	h.events.Publish(frontendEvent{Topic: "workspaceSnapshotChanged", Payload: map[string]any{
		"organizationId": organizationID,
		"resource":       "workspace",
		"change":         change,
		"projectId":      projectID,
		"workspaceId":    workspaceID,
	}})
}

func (h *JSONRPCHandler) persistPreparedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate) error {
	if h.localDatabase == nil || prepared.Registration == nil {
		return nil
	}
	row := dbconv.ProvisioningRow(*prepared.Registration)
	return localdb.NewWorkspaceStore(h.localDatabase).Create(ctx, &row)
}

func (h *JSONRPCHandler) finalizePersistedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace) error {
	if h.localDatabase == nil || prepared.Registration == nil {
		return nil
	}
	err := localdb.NewWorkspaceStore(h.localDatabase).Update(ctx, created.ID, dbconv.ActiveUpdate(created))
	// A relayed create runs on the executor node, which may not have a local row
	// for the workspace (the origin node wrote it). Tolerate a missing row: the
	// remote record is authoritative and the cache is reconciled on the next sync.
	if err != nil && !errors.Is(err, localdb.ErrWorkspaceNotFound) {
		return err
	}
	return nil
}

func (h *JSONRPCHandler) updatePersistedWorkspaceState(ctx context.Context, workspaceID string, state string, health string) error {
	if h.localDatabase == nil || strings.TrimSpace(workspaceID) == "" {
		return nil
	}
	err := localdb.NewWorkspaceStore(h.localDatabase).Update(ctx, workspaceID, dbconv.StateUpdate(state, health))
	if err != nil && !errors.Is(err, localdb.ErrWorkspaceNotFound) {
		return err
	}
	return nil
}

func (h *JSONRPCHandler) closePersistedWorkspace(ctx context.Context, workspaceID string) error {
	if h.localDatabase == nil || strings.TrimSpace(workspaceID) == "" {
		return nil
	}
	workspaceStore := localdb.NewWorkspaceStore(h.localDatabase)
	if err := workspaceStore.Update(ctx, workspaceID, dbconv.StatusUpdate(string(workspace.StatusClosed))); err != nil && !errors.Is(err, localdb.ErrWorkspaceNotFound) {
		return err
	}
	// Mirror the closed status on the remote record (best-effort). The local row
	// still carries the org/project ids after the status update.
	if record, err := workspaceStore.Get(ctx, workspaceID); err == nil {
		h.closeRemoteWorkspaceRecord(ctx, record.OrganizationID, record.ProjectID, workspaceID, string(workspace.StatusClosed))
	}
	return nil
}

func optionalWorkspaceString(value string) *string {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return nil
	}
	return &trimmedValue
}
