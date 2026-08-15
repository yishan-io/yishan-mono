package daemon

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) handleWorkspaceHealth(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceHealthParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	ws, err := h.getWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	state, health, healthErr, err := h.nodeApp.RefreshWorkspaceHealth(ctx, req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	return workspaceHealthResult{
		WorkspaceID: req.WorkspaceID,
		State:       state,
		Health:      health,
		Path:        ws.Path,
		Error:       healthErr,
	}, nil
}

func (h *JSONRPCHandler) summarizeUsedAgents(workspaceID string, closeReq workspace.CloseRequest) {
	if h.memory == nil {
		return
	}
	agents := h.getAgentUsage(workspaceID)
	if len(agents) == 0 {
		return
	}
	ws, err := h.getWorkspace(workspaceID)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("cannot resolve workspace for agent summarization")
		return
	}
	log.Info().Strs("agents", agents).Str("workspaceId", workspaceID).Msg("summarizing agents used in workspace")
	for _, agent := range agents {
		h.memory.SummarizeSession(agent, ws.Path, ws.ProjectID)
	}
}
