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
	if err := h.persistPreparedWorkspace(ctx, prepared); err != nil {
		return preparedWorkspaceCreate{}, err
	}
	return prepared, nil
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateRegistration(ctx context.Context, prepared preparedWorkspaceCreate) {
	if err := h.closePersistedWorkspace(ctx, prepared.workspaceID); err != nil {
		return
	}
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateFailure(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace) {
	_ = created
	if err := h.closePersistedWorkspace(ctx, prepared.workspaceID); err != nil {
		return
	}

	closeReq := createflow.BuildCreateFailureClosePathRequest(created, prepared.localCreate.TargetBranch)
	h.cleanupLocalWorkspaceCreateFailure(ctx, closeReq)
}
