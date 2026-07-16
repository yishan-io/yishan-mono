package daemon

import (
	"context"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/workspace"
	createflow "yishan/apps/cli/internal/workspace/createflow"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) dispatchRemoteWorkspaceCreate(req workspaceCreateParams) error {
	payload := createflow.BuildRelayRequestEnvelope(req, h.nodeID, buildWorkspaceCreateStartedEvent(req, req.NodeID, req.Branch))
	return h.sendWorkspaceSnapshotRelayNotification(payload)
}

func (h *JSONRPCHandler) relayWorkspaceCreateProgress(prepared preparedWorkspaceCreate, event workspace.CreateProgressEvent) {
	if strings.TrimSpace(prepared.relayReplyNodeID) == "" {
		return
	}
	payload := createflow.BuildRelayProgressEnvelope(prepared.workspaceID, prepared.organizationID, prepared.projectID, h.nodeID, prepared.relayReplyNodeID, event)
	if err := h.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.workspaceID).Msg("relay workspace create progress failed")
	}
}

func (h *JSONRPCHandler) relayWorkspaceCreateCompleted(prepared preparedWorkspaceCreate, completed map[string]any) {
	if strings.TrimSpace(prepared.relayReplyNodeID) == "" {
		return
	}
	payload := createflow.BuildRelayCompletedEnvelope(prepared.workspaceID, prepared.organizationID, prepared.projectID, h.nodeID, prepared.relayReplyNodeID, completed)
	if err := h.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.workspaceID).Msg("relay workspace create completed failed")
	}
}

func (h *JSONRPCHandler) relayWorkspaceCreateFailed(prepared preparedWorkspaceCreate, failed workspaceCreateFailedEvent) {
	if strings.TrimSpace(prepared.relayReplyNodeID) == "" {
		return
	}
	payload := createflow.BuildRelayFailedEnvelope(prepared.workspaceID, prepared.organizationID, prepared.projectID, h.nodeID, prepared.relayReplyNodeID, failed)
	if err := h.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.workspaceID).Msg("relay workspace create failed relay failed")
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

func (h *JSONRPCHandler) handleRelayedWorkspaceCreate(payload relayWorkspaceCreateEnvelope) {
	if payload.Request == nil || strings.TrimSpace(payload.TargetNodeID) != h.nodeID {
		return
	}
	prepared, err := h.prepareWorkspaceCreate(h.serverContextOrBackground(), *payload.Request)
	if err != nil {
		failed := workspaceCreateFailedEvent{WorkspaceID: payload.WorkspaceID, Message: err.Error()}
		h.relayWorkspaceCreateFailed(preparedWorkspaceCreate{workspaceID: payload.WorkspaceID, organizationID: payload.OrganizationID, projectID: payload.ProjectID, relayReplyNodeID: strings.TrimSpace(payload.SourceNodeID)}, failed)
		return
	}
	go h.executeWorkspaceCreate(h.serverContextOrBackground(), prepared)
}

func (h *JSONRPCHandler) republishRelayedWorkspaceCreate(payload relayWorkspaceCreateEnvelope) {
	if event, ok := createflow.RepublishedRelayCreateEvent(payload, h.nodeID); ok {
		h.events.Publish(*event)
	}
}

func (h *JSONRPCHandler) serverContextOrBackground() context.Context {
	if h.serverCtx != nil {
		return h.serverCtx
	}
	return context.Background()
}
