package node

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func (s *Services) dispatchRemoteWorkspaceCreate(req workspaceCreateParams, started workspaceCreateStartedEvent) error {
	payload := relay.BuildCreateRequest(req, s.nodeID, started)
	return s.relayClient.SendDispatchRequest(payload, strings.TrimSpace(req.NodeID))
}

func (s *Services) relayWorkspaceCreateProgress(prepared preparedWorkspaceCreate, event workspace.CreateProgressEvent) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateProgress(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, s.nodeID, prepared.RelayReplyNodeID, event)
	if err := s.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create progress failed")
	}
}

func (s *Services) relayWorkspaceCreateCompleted(prepared preparedWorkspaceCreate, completed map[string]any) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateCompleted(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, s.nodeID, prepared.RelayReplyNodeID, completed)
	if err := s.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create completed failed")
	}
}

func (s *Services) relayWorkspaceCreateFailed(prepared preparedWorkspaceCreate, failed workspaceCreateFailedEvent) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateFailed(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, s.nodeID, prepared.RelayReplyNodeID, failed)
	if err := s.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create failed relay failed")
	}
}

func (s *Services) sendWorkspaceSnapshotRelayNotification(payload relayWorkspaceCreateEnvelope) error {
	return s.relayClient.SendNotification(relay.MethodWorkspaceSnapshotChanged, payload)
}

// handleRelayedWorkspaceCreate runs a create relayed from the origin node on
// the executor: prepare → register (local row) → async execution, without the
// origin-side created events.
func (s *Services) handleRelayedWorkspaceCreate(payload relayWorkspaceCreateEnvelope) {
	if payload.Request == nil || strings.TrimSpace(payload.TargetNodeID) != s.nodeID {
		return
	}
	if err := s.app.ExecuteRelayed(s.serverContextOrBackground(), workspaceCreateParams(*payload.Request)); err != nil {
		failed := workspaceCreateFailedEvent{WorkspaceID: payload.WorkspaceID, Message: err.Error()}
		s.relayWorkspaceCreateFailed(preparedWorkspaceCreate{WorkspaceID: payload.WorkspaceID, OrganizationID: payload.OrganizationID, ProjectID: payload.ProjectID, RelayReplyNodeID: strings.TrimSpace(payload.SourceNodeID)}, failed)
	}
}

func (s *Services) republishRelayedWorkspaceCreate(payload relayWorkspaceCreateEnvelope) {
	if event, ok := relay.RepublishedCreateEvent(payload, s.nodeID); ok {
		s.events.Publish(*event)
	}
}

func (s *Services) serverContextOrBackground() context.Context {
	if s.serverCtx != nil {
		return s.serverCtx
	}
	return context.Background()
}
