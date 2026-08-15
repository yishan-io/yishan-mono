package node

import (
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func (s *Services) summarizeUsedAgents(workspaceID string, closeReq workspace.CloseRequest) {
	if s.memory == nil {
		return
	}
	agents := s.getAgentUsage(workspaceID)
	if len(agents) == 0 {
		return
	}
	ws, err := s.getWorkspace(workspaceID)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("cannot resolve workspace for agent summarization")
		return
	}
	log.Info().Strs("agents", agents).Str("workspaceId", workspaceID).Msg("summarizing agents used in workspace")
	for _, agent := range agents {
		s.memory.SummarizeSession(agent, ws.Path, ws.ProjectID)
	}
}
