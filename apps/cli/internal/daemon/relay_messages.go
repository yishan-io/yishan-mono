package daemon

import (
	"encoding/json"
	"strings"

	"github.com/rs/zerolog/log"
)

// publishWorkspaceSnapshotChanged republishes relay workspace snapshot changes
// as frontend events and runs the relayed create/close workflows on this node
// when this node is the target.
func publishWorkspaceSnapshotChanged(handler *JSONRPCHandler, params json.RawMessage) {
	if payload, ok := decodeRelayWorkspaceCreateEnvelope(params); ok {
		switch payload.Change {
		case workspaceRelayChangeCreateRequest:
			handler.handleRelayedWorkspaceCreate(payload)
			handler.republishRelayedWorkspaceCreate(payload)
		default:
			handler.republishRelayedWorkspaceCreate(payload)
		}
		return
	}

	if payload, ok := decodeRelayWorkspaceCloseEnvelope(params); ok {
		if payload.Change == relayChangeWorkspaceCloseRequest && strings.TrimSpace(payload.TargetNodeID) == strings.TrimSpace(handler.nodeID) {
			handler.handleRelayedWorkspaceClose(payload)
		}
		return
	}

	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid workspace snapshot change params")
			return
		}
	}
	if payload == nil {
		payload = map[string]any{}
	}

	organizationID, _ := payload["organizationId"].(string)
	resource, _ := payload["resource"].(string)
	change, _ := payload["change"].(string)
	projectID, _ := payload["projectId"].(string)
	workspaceID, _ := payload["workspaceId"].(string)
	sourceNodeID, _ := payload["sourceNodeId"].(string)
	log.Info().
		Str("organizationId", strings.TrimSpace(organizationID)).
		Str("resource", strings.TrimSpace(resource)).
		Str("change", strings.TrimSpace(change)).
		Str("projectId", strings.TrimSpace(projectID)).
		Str("workspaceId", strings.TrimSpace(workspaceID)).
		Str("sourceNodeId", strings.TrimSpace(sourceNodeID)).
		Msg("relay: workspace snapshot change received")

	if sourceNodeID != "" && strings.TrimSpace(sourceNodeID) == strings.TrimSpace(handler.nodeID) {
		return
	}

	handler.events.Publish(frontendEvent{Topic: "workspaceSnapshotChanged", Payload: payload})
}

// publishTerminalSessionChanged republishes relay terminal session changes as
// frontend events.
func publishTerminalSessionChanged(handler *JSONRPCHandler, params json.RawMessage) {
	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid terminal session changed params")
			return
		}
	}
	if payload == nil {
		payload = map[string]any{}
	}

	sessionID, _ := payload["sessionId"].(string)
	workspaceID, _ := payload["workspaceId"].(string)
	action, _ := payload["action"].(string)
	log.Info().
		Str("sessionId", strings.TrimSpace(sessionID)).
		Str("workspaceId", strings.TrimSpace(workspaceID)).
		Str("action", strings.TrimSpace(action)).
		Msg("relay: terminal session change received")

	handler.events.Publish(frontendEvent{Topic: "terminalSessionChanged", Payload: payload})
}
