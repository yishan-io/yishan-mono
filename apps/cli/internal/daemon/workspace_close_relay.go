package daemon

import (
	"encoding/json"
	"strings"

	"github.com/rs/zerolog/log"
)

const relayChangeWorkspaceCloseRequest = "workspace.close.request"

// relayWorkspaceCloseEnvelope is the relay payload for a remote workspace close.
type relayWorkspaceCloseEnvelope struct {
	OrganizationID string `json:"organizationId,omitempty"`
	ProjectID      string `json:"projectId,omitempty"`
	WorkspaceID    string `json:"workspaceId,omitempty"`
	SourceNodeID   string `json:"sourceNodeId,omitempty"`
	TargetNodeID   string `json:"targetNodeId,omitempty"`
	Change         string `json:"change,omitempty"`
	Branch         string `json:"branch,omitempty"`
	RemoveBranch   bool   `json:"removeBranch,omitempty"`
	ForceWorktree  bool   `json:"forceWorktree,omitempty"`
	ForceBranch    bool   `json:"forceBranch,omitempty"`
	PostHook       string `json:"postHook,omitempty"`
}

func decodeRelayWorkspaceCloseEnvelope(params json.RawMessage) (relayWorkspaceCloseEnvelope, bool) {
	var payload relayWorkspaceCloseEnvelope
	if len(params) == 0 {
		return relayWorkspaceCloseEnvelope{}, false
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return relayWorkspaceCloseEnvelope{}, false
	}
	if !strings.HasPrefix(strings.TrimSpace(payload.Change), "workspace.close.") {
		return relayWorkspaceCloseEnvelope{}, false
	}
	return payload, true
}

// handleRelayedWorkspaceClose tears down the workspace on the executor node via
// the application close pipeline (no routing — the executor IS the owner node).
func (h *JSONRPCHandler) handleRelayedWorkspaceClose(payload relayWorkspaceCloseEnvelope) {
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
	if _, err := h.app.CloseLocal(h.serverContextOrBackground(), req); err != nil {
		log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("relayed workspace close failed")
	}
}
