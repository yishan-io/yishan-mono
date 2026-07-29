package daemon

import (
	"context"
	"errors"
	"strings"

	"github.com/rs/zerolog/log"
	localdb "yishan/apps/cli/internal/db"
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
	if h.localDatabase == nil || prepared.registration == nil {
		return nil
	}
	registration := prepared.registration
	return localdb.NewWorkspaceStore(h.localDatabase).Create(ctx, &localdb.Workspace{
		ID:             registration.ID,
		OrganizationID: registration.OrganizationID,
		ProjectID:      registration.ProjectID,
		NodeID:         registration.NodeID,
		Kind:           registration.Kind,
		Status:         "provisioning",
		Branch:         optionalWorkspaceString(registration.Branch),
		SourceBranch:   optionalWorkspaceString(registration.SourceBranch),
		LocalPath:      "",
		State:          workspace.WorkspaceStateActive,
	})
}

func (h *JSONRPCHandler) finalizePersistedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace) error {
	if h.localDatabase == nil || prepared.registration == nil {
		return nil
	}
	status := "active"
	state := created.State
	return localdb.NewWorkspaceStore(h.localDatabase).Update(ctx, created.ID, localdb.WorkspaceUpdate{
		Status: &status, State: &state, LocalPath: &created.Path,
	})
}

func (h *JSONRPCHandler) closePersistedWorkspace(ctx context.Context, workspaceID string) error {
	if h.localDatabase == nil || strings.TrimSpace(workspaceID) == "" {
		return nil
	}
	status := "closed"
	err := localdb.NewWorkspaceStore(h.localDatabase).Update(ctx, workspaceID, localdb.WorkspaceUpdate{Status: &status})
	if err != nil && !errors.Is(err, localdb.ErrWorkspaceNotFound) {
		return err
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

func (h *JSONRPCHandler) upsertWorkspaceIndex(created workspace.Workspace) {
	if h.wsIndexStore == nil || created.Path == "" {
		return
	}
	if err := h.wsIndexStore.Upsert(workspaceIndexEntry{WorkspaceID: created.ID, WorktreePath: created.Path, ProjectID: created.ProjectID, OrgID: created.OrgID, State: created.State}); err != nil {
		log.Warn().Err(err).Str("workspaceId", created.ID).Msg("workspace index store upsert failed on create")
	}
}
