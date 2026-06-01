package daemon

import (
	"context"
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatchContext(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodContextGetState:
		return h.context.GetState(), nil

	case MethodContextSetCurrentOrg:
		var req struct {
			OrgID string `json:"orgId"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		orgID := strings.TrimSpace(req.OrgID)
		if orgID == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "orgId is required")
		}
		if err := h.context.SetCurrentOrg(orgID); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil

	case MethodContextSetActiveProject:
		var req struct {
			ProjectID string `json:"projectId"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		h.context.SetActiveProject(strings.TrimSpace(req.ProjectID))
		return map[string]bool{"ok": true}, nil

	case MethodContextSetActiveFile:
		var req struct {
			FilePath string `json:"filePath"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		h.context.SetActiveFile(strings.TrimSpace(req.FilePath))
		return map[string]bool{"ok": true}, nil

	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown context method: "+method)
	}
}
