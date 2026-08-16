package node

import (
	"encoding/json"
	internalevents "yishan/apps/cli/internal/events"
	"strings"

	"github.com/rs/zerolog/log"
)

// publishWorkspaceSnapshotChanged republishes relay workspace snapshot changes
// as frontend events and runs the relayed create/close workflows on this node
// when this node is the target.
func publishWorkspaceSnapshotChanged(handler *Service, params json.RawMessage) {
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
		if payload.Change == relayChangeWorkspaceCloseRequest && strings.TrimSpace(payload.TargetNodeID) == strings.TrimSpace(handler.deps.NodeID) {
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

	if sourceNodeID != "" && strings.TrimSpace(sourceNodeID) == strings.TrimSpace(handler.deps.NodeID) {
		return
	}

	handler.deps.Events.Publish(internalevents.Event{Topic: "workspaceSnapshotChanged", Payload: payload})
}
