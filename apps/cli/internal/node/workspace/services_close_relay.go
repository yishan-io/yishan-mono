package workspace

import (
	"github.com/rs/zerolog/log"
)

// handleRelayedWorkspaceClose tears down the workspace on the executor node via
// the application close pipeline (no routing — the executor IS the owner node).
func (s *Service) handleRelayedClose(payload relayWorkspaceCloseEnvelope) {
	req := workspaceCloseParams{
		WorkspaceID:    payload.WorkspaceID,
		OrganizationID: payload.OrganizationID,
		ProjectID:      payload.ProjectID,
		Branch:         payload.Branch,
		RemoveBranch:   payload.RemoveBranch,
		ForceWorktree:  payload.ForceWorktree,
		ForceBranch:    payload.ForceBranch,
		PostHook:       payload.PostHook,
	}
	if _, err := s.app.CloseLocal(s.serverContext(), req); err != nil {
		log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("relayed workspace close failed")
	}
}
