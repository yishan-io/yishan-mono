package daemon

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// ContextService implementation: each method reads or updates the renderer
// context store.

func (h *JSONRPCHandler) ContextGetState() (any, error) {
	return h.context.GetState(), nil
}

func (h *JSONRPCHandler) ContextSetCurrentOrg(ctx context.Context, req rpc.ContextSetCurrentOrgParams) (any, error) {
	orgID := strings.TrimSpace(req.OrgID)
	if orgID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "orgId is required")
	}
	if err := h.context.SetCurrentOrg(orgID); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ContextSetActiveProject(ctx context.Context, req rpc.ContextSetActiveProjectParams) (any, error) {
	h.context.SetActiveProject(strings.TrimSpace(req.ProjectID))
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ContextSetActiveFile(ctx context.Context, req rpc.ContextSetActiveFileParams) (any, error) {
	h.context.SetActiveFile(strings.TrimSpace(req.FilePath))
	return map[string]bool{"ok": true}, nil
}
