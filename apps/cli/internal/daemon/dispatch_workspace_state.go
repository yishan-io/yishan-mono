package daemon

import (
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

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
