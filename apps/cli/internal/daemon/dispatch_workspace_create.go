package daemon

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/workspace/application"
)

// handleWorkspaceCreate is a compatibility adapter: decode the request, call
// the one application method, encode the result. Routing and rollback policy
// live in application.Service.
func (h *JSONRPCHandler) handleWorkspaceCreate(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceCreateParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	result, err := h.app.Create(ctx, application.CreateCommand(req))
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": result.ID, "status": result.Status}, nil
}
