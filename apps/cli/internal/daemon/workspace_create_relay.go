package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

type relayWorkspaceCreateEnvelope struct {
	OrganizationID string                         `json:"organizationId,omitempty"`
	ProjectID      string                         `json:"projectId,omitempty"`
	WorkspaceID    string                         `json:"workspaceId,omitempty"`
	SourceNodeID   string                         `json:"sourceNodeId,omitempty"`
	TargetNodeID   string                         `json:"targetNodeId,omitempty"`
	Change         string                         `json:"change,omitempty"`
	Request        *workspaceCreateParams         `json:"request,omitempty"`
	Progress       *workspace.CreateProgressEvent `json:"progress,omitempty"`
	Completed      map[string]any                 `json:"completed,omitempty"`
	Failed         *workspaceCreateFailedEvent    `json:"failed,omitempty"`
}

type workspaceCreateFailedEvent struct {
	WorkspaceID string `json:"workspaceId"`
	Message     string `json:"message"`
}

func (h *JSONRPCHandler) dispatchRemoteWorkspaceCreate(req workspaceCreateParams) error {
	payload := relayWorkspaceCreateEnvelope{
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
		WorkspaceID:    req.ID,
		SourceNodeID:   h.nodeID,
		TargetNodeID:   req.NodeID,
		Change:         workspaceRelayChangeCreateRequest,
		Request:        &req,
	}
	return h.sendWorkspaceSnapshotRelayNotification(payload)
}

func (h *JSONRPCHandler) relayWorkspaceCreateProgress(prepared preparedWorkspaceCreate, event workspace.CreateProgressEvent) {
	if strings.TrimSpace(prepared.relayReplyNodeID) == "" {
		return
	}
	payload := relayWorkspaceCreateEnvelope{OrganizationID: prepared.organizationID, ProjectID: prepared.projectID, WorkspaceID: prepared.workspaceID, SourceNodeID: h.nodeID, TargetNodeID: prepared.relayReplyNodeID, Change: workspaceRelayChangeCreateProgress, Progress: &event}
	if err := h.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.workspaceID).Msg("relay workspace create progress failed")
	}
}

func (h *JSONRPCHandler) relayWorkspaceCreateCompleted(prepared preparedWorkspaceCreate, completed map[string]any) {
	if strings.TrimSpace(prepared.relayReplyNodeID) == "" {
		return
	}
	payload := relayWorkspaceCreateEnvelope{OrganizationID: prepared.organizationID, ProjectID: prepared.projectID, WorkspaceID: prepared.workspaceID, SourceNodeID: h.nodeID, TargetNodeID: prepared.relayReplyNodeID, Change: workspaceRelayChangeCreateCompleted, Completed: completed}
	if err := h.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.workspaceID).Msg("relay workspace create completed failed")
	}
}

func (h *JSONRPCHandler) relayWorkspaceCreateFailed(prepared preparedWorkspaceCreate, failed workspaceCreateFailedEvent) {
	if strings.TrimSpace(prepared.relayReplyNodeID) == "" {
		return
	}
	payload := relayWorkspaceCreateEnvelope{OrganizationID: prepared.organizationID, ProjectID: prepared.projectID, WorkspaceID: prepared.workspaceID, SourceNodeID: h.nodeID, TargetNodeID: prepared.relayReplyNodeID, Change: workspaceRelayChangeCreateFailed, Failed: &failed}
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
	if strings.TrimSpace(payload.TargetNodeID) != h.nodeID {
		return
	}
	switch payload.Change {
	case workspaceRelayChangeCreateProgress:
		if payload.Progress != nil {
			h.events.Publish(frontendEvent{Topic: "workspaceCreateProgress", Payload: *payload.Progress})
		}
	case workspaceRelayChangeCreateCompleted:
		if payload.Completed != nil {
			h.events.Publish(frontendEvent{Topic: "workspaceCreateCompleted", Payload: payload.Completed})
		}
	case workspaceRelayChangeCreateFailed:
		if payload.Failed != nil {
			h.events.Publish(frontendEvent{Topic: "workspaceCreateFailed", Payload: *payload.Failed})
		}
	}
}

func decodeRelayWorkspaceCreateEnvelope(params json.RawMessage) (relayWorkspaceCreateEnvelope, bool) {
	var payload relayWorkspaceCreateEnvelope
	if len(params) == 0 {
		return relayWorkspaceCreateEnvelope{}, false
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return relayWorkspaceCreateEnvelope{}, false
	}
	if !strings.HasPrefix(strings.TrimSpace(payload.Change), "workspace.create.") {
		return relayWorkspaceCreateEnvelope{}, false
	}
	return payload, true
}

func (h *JSONRPCHandler) serverContextOrBackground() context.Context {
	if h.serverCtx != nil {
		return h.serverCtx
	}
	return context.Background()
}
