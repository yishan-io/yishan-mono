package daemon

import (
	"context"
	"encoding/json"
	"fmt"
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

// resolveRemoteWorkspaceNode looks up the workspace's executor node from the
// remote API when no local row exists (a relayed create leaves no local row on
// the origin). Returns "" when unresolvable.
func (h *JSONRPCHandler) resolveRemoteWorkspaceNode(ctx context.Context, orgID string, projectID string, workspaceID string) string {
	if strings.TrimSpace(orgID) == "" || strings.TrimSpace(projectID) == "" || h.runtime == nil || !h.runtime.APIConfigured() {
		return ""
	}
	response, err := h.runtime.APIClient().ListWorkspaces(orgID, projectID)
	if err != nil {
		log.Warn().Err(err).Str("orgId", orgID).Str("projectId", projectID).Str("workspaceId", workspaceID).Msg("resolve workspace node: list workspaces failed")
		return ""
	}
	for _, workspace := range response.Workspaces {
		if workspace.ID == workspaceID {
			return workspace.NodeID
		}
	}
	return ""
}

// relayWorkspaceClose forwards a close request to the node that owns the
// workspace's worktree. The executor runs the same local-first close path and
// marks the remote record closed.
func (h *JSONRPCHandler) relayWorkspaceClose(req workspaceCloseParams, targetNodeID string) (any, error) {
	payload := relayWorkspaceCloseEnvelope{
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
		WorkspaceID:    req.WorkspaceID,
		SourceNodeID:   h.nodeID,
		TargetNodeID:   targetNodeID,
		Change:         relayChangeWorkspaceCloseRequest,
		Branch:         req.Branch,
		RemoveBranch:   req.RemoveBranch,
		ForceWorktree:  req.ForceWorktree,
		ForceBranch:    req.ForceBranch,
		PostHook:       req.PostHook,
	}
	h.relayConnMu.RLock()
	conn := h.relayConn
	h.relayConnMu.RUnlock()
	if conn == nil {
		return nil, fmt.Errorf("relay not connected")
	}
	msg := notification{JSONRPC: "2.0", Method: relayMethodWorkspaceSnapshotChanged, Params: payload}
	if err := conn.WriteJSON(msg); err != nil {
		return nil, fmt.Errorf("relay write failed: %w", err)
	}
	return map[string]any{"workspaceId": req.WorkspaceID, "status": "closing"}, nil
}

// handleRelayedWorkspaceClose tears down the workspace on the executor node.
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
	if _, err := h.closeWorkspaceLocally(h.serverContextOrBackground(), req); err != nil {
		log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("relayed workspace close failed")
	}
}
