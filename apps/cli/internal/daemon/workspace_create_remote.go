package daemon

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/api"
	cliruntime "yishan/apps/cli/internal/runtime"

	"github.com/rs/zerolog/log"
)

// remoteWorkspaceRecordsEnabled reports whether the daemon can write workspace
// records to the remote API. When false the remote write is skipped and the
// local SQLite row remains the only record (offline or unauthenticated mode).
func remoteWorkspaceRecordsEnabled(runtime *cliruntime.Runtime) bool {
	return runtime != nil && runtime.APIConfigured()
}

// createRemoteWorkspaceRecord writes the workspace record to the remote API in
// the provisioning state (empty localPath) before the worktree is provisioned.
// It is called on the origin node before dispatch, so the record exists whether
// the worktree is built locally or on a remote node. The daemon-generated
// workspace ID is passed through so local and remote IDs stay aligned.
//
// Best-effort: failures are logged and the local record remains the source of
// truth until the next remote→local cache sync reconciles the row.
func (h *JSONRPCHandler) createRemoteWorkspaceRecord(ctx context.Context, registration WorkspaceCreation) {
	if !remoteWorkspaceRecordsEnabled(h.runtime) {
		return
	}
	_, err := h.runtime.APIClient().CreateWorkspace(registration.OrganizationID, registration.ProjectID, api.CreateWorkspaceInput{
		ID:           registration.ID,
		NodeID:       registration.NodeID,
		Kind:         registration.Kind,
		Branch:       registration.Branch,
		SourceBranch: registration.SourceBranch,
		SourceNodeID: h.nodeID,
	})
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", registration.ID).Msg("failed to create remote workspace record")
	}
}

// updateRemoteWorkspaceRecord records the final worktree path on the remote
// workspace, transitioning it from provisioning to active once the local
// worktree has been provisioned.
//
// Best-effort: failures are logged and the local record remains the source of
// truth until the next remote→local cache sync reconciles the row.
func (h *JSONRPCHandler) updateRemoteWorkspaceRecord(ctx context.Context, registration WorkspaceCreation, localPath string) {
	if !remoteWorkspaceRecordsEnabled(h.runtime) {
		return
	}
	_, err := h.runtime.APIClient().UpdateWorkspace(registration.OrganizationID, registration.ProjectID, api.UpdateWorkspaceInput{
		WorkspaceID:  registration.ID,
		LocalPath:    localPath,
		SourceNodeID: h.nodeID,
	})
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", registration.ID).Msg("failed to update remote workspace record")
	}
}

// closeRemoteWorkspaceRecord marks the workspace record closed in the remote
// API. Best-effort: failures are logged and the local record remains the source
// of truth until the next remote→local cache sync reconciles the row.
func (h *JSONRPCHandler) closeRemoteWorkspaceRecord(ctx context.Context, organizationID string, projectID string, workspaceID string) {
	if !remoteWorkspaceRecordsEnabled(h.runtime) {
		return
	}
	if strings.TrimSpace(organizationID) == "" || strings.TrimSpace(projectID) == "" {
		return
	}
	_, err := h.runtime.APIClient().CloseWorkspace(organizationID, projectID, api.CloseWorkspaceInput{
		WorkspaceID:  workspaceID,
		SourceNodeID: h.nodeID,
	})
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("failed to close remote workspace record")
	}
}
