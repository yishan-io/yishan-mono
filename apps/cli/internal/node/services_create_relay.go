package node

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func (s *Service) dispatchRemoteWorkspaceCreate(req workspaceCreateParams, started workspaceCreateStartedEvent) error {
	payload := relay.BuildCreateRequest(req, s.deps.NodeID, started)
	return s.relayClient.SendDispatchRequest(payload, strings.TrimSpace(req.NodeID))
}

func (s *Service) relayWorkspaceCreateProgress(prepared preparedWorkspaceCreate, event workspace.CreateProgressEvent) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateProgress(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, s.deps.NodeID, prepared.RelayReplyNodeID, event)
	if err := s.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create progress failed")
	}
}

func (s *Service) RelayWorkspaceCreateCompleted(prepared preparedWorkspaceCreate, completed map[string]any) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateCompleted(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, s.deps.NodeID, prepared.RelayReplyNodeID, completed)
	if err := s.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create completed failed")
	}
}

func (s *Service) relayWorkspaceCreateFailed(prepared preparedWorkspaceCreate, failed workspaceCreateFailedEvent) {
	if strings.TrimSpace(prepared.RelayReplyNodeID) == "" {
		return
	}
	payload := relay.BuildCreateFailed(prepared.WorkspaceID, prepared.OrganizationID, prepared.ProjectID, s.deps.NodeID, prepared.RelayReplyNodeID, failed)
	if err := s.sendWorkspaceSnapshotRelayNotification(payload); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.WorkspaceID).Msg("relay workspace create failed relay failed")
	}
}

func (s *Service) sendWorkspaceSnapshotRelayNotification(payload relayWorkspaceCreateEnvelope) error {
	return s.relayClient.SendNotification(relay.MethodWorkspaceSnapshotChanged, payload)
}

// handleRelayedWorkspaceCreate runs a create relayed from the origin node on
// the executor: prepare → register (local row) → async execution, without the
// origin-side created events.
func (s *Service) handleRelayedWorkspaceCreate(payload relayWorkspaceCreateEnvelope) {
	if payload.Request == nil || strings.TrimSpace(payload.TargetNodeID) != s.deps.NodeID {
		return
	}
	if err := s.app.ExecuteRelayed(s.serverContextOrBackground(), workspaceCreateParams(*payload.Request)); err != nil {
		failed := workspaceCreateFailedEvent{WorkspaceID: payload.WorkspaceID, Message: err.Error()}
		s.relayWorkspaceCreateFailed(preparedWorkspaceCreate{WorkspaceID: payload.WorkspaceID, OrganizationID: payload.OrganizationID, ProjectID: payload.ProjectID, RelayReplyNodeID: strings.TrimSpace(payload.SourceNodeID)}, failed)
	}
}

func (s *Service) republishRelayedWorkspaceCreate(payload relayWorkspaceCreateEnvelope) {
	if event, ok := relay.RepublishedCreateEvent(payload, s.deps.NodeID); ok {
		s.deps.Events.Publish(*event)
	}
}

func (s *Service) serverContextOrBackground() context.Context {
	if s.deps.ServerCtx != nil {
		return s.deps.ServerCtx
	}
	return context.Background()
}
