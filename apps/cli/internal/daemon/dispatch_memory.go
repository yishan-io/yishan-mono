package daemon

import (
	"encoding/json"

	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/workspace"
)

type memorySearchParams struct {
	Query       string `json:"query"`
	WorkspaceID string `json:"workspaceId"`
	Scope       string `json:"scope"`
	Limit       int    `json:"limit"`
}

func (h *JSONRPCHandler) dispatchMemory(method string, params json.RawMessage) (any, error) {
	if h.memory == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "memory service not available")
	}

	switch method {
	case MethodMemorySearch:
		var req memorySearchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if req.Query == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "query is required")
		}
		projectID := ""
		if req.WorkspaceID != "" {
			if handle, err := h.manager.WorkspaceHandle(req.WorkspaceID); err == nil {
				projectID = handle.Workspace().ProjectID
			}
		}
		return h.memory.Search(h.serverCtx, req.Query, projectID, req.Scope, req.Limit)

	case MethodMemoryReconcile:
		refs := make([]memory.WorkspaceRef, 0)
		for _, ws := range h.manager.List() {
			if ws.Path != "" {
				refs = append(refs, memory.WorkspaceRef{
					WorktreePath: ws.Path,
					ProjectID:    ws.ProjectID,
				})
			}
		}
		result, err := h.memory.ReconcileNow(refs)
		if err != nil {
			return nil, err
		}
		return result, nil

	case MethodMemoryStatus:
		return map[string]any{
			"enabled": h.memory.SummarizerEnabled(),
		}, nil

	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown memory method: "+method)
	}
}
