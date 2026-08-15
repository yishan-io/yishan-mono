package daemon

import (
	"context"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) dispatchRemoteWorkspaceCreate(req workspaceCreateParams, started workspaceCreateStartedEvent) error {
	payload := relay.BuildCreateRequest(req, h.nodeID, started)
	return h.sendRelayDispatchRequest(payload, strings.TrimSpace(req.NodeID))
}

func (h *JSONRPCHandler) relayWorkspaceCreateProgress(prepared preparedWorkspaceCreate, event workspace.CreateProgressEvent) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateProgress(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, h.nodeID, prepared.RelayReplyNodeID, event)
	if err := h.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create progress failed")
	}
}

func (h *JSONRPCHandler) relayWorkspaceCreateCompleted(prepared preparedWorkspaceCreate, completed map[string]any) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateCompleted(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, h.nodeID, prepared.RelayReplyNodeID, completed)
	if err := h.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create completed failed")
	}
}

func (h *JSONRPCHandler) relayWorkspaceCreateFailed(prepared preparedWorkspaceCreate, failed workspaceCreateFailedEvent) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateFailed(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, h.nodeID, prepared.RelayReplyNodeID, failed)
	if err := h.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create failed relay failed")
	}
}

func (h *JSONRPCHandler) sendWorkspaceSnapshotRelayNotification(payload relayWorkspaceCreateEnvelope) error {
	h.relayConnMu.RLock()
	conn := h.relayConn
	h.relayConnMu.RUnlock()
	if conn == nil {
		return fmt.Errorf("relay not connected")
	}
	msg := notification{JSONRPC: "2.0", Method: relayMethodWorkspaceSnapshotChanged, Params: payload}
	if err := conn.WriteJSON(msg); err != nil {
		return fmt.Errorf("relay write failed: %w", err)
	}
	return nil
}

// handleRelayedWorkspaceCreate runs a create relayed from the origin node on
// the executor: prepare → register (local row) → async execution, without the
// origin-side created events.
func (h *JSONRPCHandler) handleRelayedWorkspaceCreate(payload relayWorkspaceCreateEnvelope) {
	if payload.Request == nil || strings.TrimSpace(payload.TargetNodeID) != h.nodeID {
		return
	}
	if err := h.app.ExecuteRelayed(h.serverContextOrBackground(), workspaceCreateParams(*payload.Request)); err != nil {
		failed := workspaceCreateFailedEvent{WorkspaceID: payload.WorkspaceID, Message: err.Error()}
		h.relayWorkspaceCreateFailed(preparedWorkspaceCreate{WorkspaceID: payload.WorkspaceID, OrganizationID: payload.OrganizationID, ProjectID: payload.ProjectID, RelayReplyNodeID: strings.TrimSpace(payload.SourceNodeID)}, failed)
	}
}

func (h *JSONRPCHandler) republishRelayedWorkspaceCreate(payload relayWorkspaceCreateEnvelope) {
	if event, ok := relay.RepublishedCreateEvent(payload, h.nodeID); ok {
		h.events.Publish(*event)
	}
}

func (h *JSONRPCHandler) serverContextOrBackground() context.Context {
	if h.serverCtx != nil {
		return h.serverCtx
	}
	return context.Background()
}
