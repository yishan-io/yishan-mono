package daemon

import (
	"strings"

	"github.com/rs/zerolog/log"
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

func (h *JSONRPCHandler) upsertWorkspaceIndex(created workspace.Workspace) {
	if h.wsIndexStore == nil || created.Path == "" {
		return
	}
	if err := h.wsIndexStore.Upsert(workspaceIndexEntry{WorkspaceID: created.ID, WorktreePath: created.Path, ProjectID: created.ProjectID, OrgID: created.OrgID, State: created.State}); err != nil {
		log.Warn().Err(err).Str("workspaceId", created.ID).Msg("workspace index store upsert failed on create")
	}
}
