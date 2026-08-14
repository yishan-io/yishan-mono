package daemon

import (
	"context"

	"yishan/apps/cli/internal/workspace"
	createflow "yishan/apps/cli/internal/workspace/createflow"
)

func (h *JSONRPCHandler) registerPreparedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate) (preparedWorkspaceCreate, error) {
	if prepared.registration == nil {
		return prepared, nil
	}
	// A remote-target create is forwarded to the executor node, which owns the
	// worktree and its local runtime record. The origin only relays — it must
	// not write a local record for a workspace that lives on another node.
	if prepared.remoteRequest != nil {
		return prepared, nil
	}
	if err := h.persistPreparedWorkspace(ctx, prepared); err != nil {
		return preparedWorkspaceCreate{}, err
	}
	return prepared, nil
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateRegistration(ctx context.Context, prepared preparedWorkspaceCreate) {
	if err := h.closePersistedWorkspace(ctx, prepared.workspaceID); err != nil {
		return
	}
	h.closeRemoteWorkspaceRecordForRegistration(ctx, prepared)
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateFailure(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace) {
	_ = created
	if err := h.closePersistedWorkspace(ctx, prepared.workspaceID); err != nil {
		return
	}
	h.closeRemoteWorkspaceRecordForRegistration(ctx, prepared)

	closeReq := createflow.BuildCreateFailureClosePathRequest(created, prepared.localCreate.TargetBranch)
	h.cleanupLocalWorkspaceCreateFailure(ctx, closeReq)
}

// closeRemoteWorkspaceRecordForRegistration marks the remote record closed from
// the prepared registration (org/project/ID) rather than a local row lookup. The
// origin of a remote-target create has no local row, so without this the remote
// provisioning record would leak on dispatch failure. Idempotent when the local
// path already closed it.
func (h *JSONRPCHandler) closeRemoteWorkspaceRecordForRegistration(ctx context.Context, prepared preparedWorkspaceCreate) {
	if prepared.registration == nil {
		return
	}
	registration := prepared.registration
	h.closeRemoteWorkspaceRecord(ctx, registration.OrganizationID, registration.ProjectID, registration.ID)
}
