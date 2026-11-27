package workspace

import (
	"context"
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/adapter/relay"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/rpc"

	"github.com/rs/zerolog/log"
)

// HandleRelayMessage implements relay.MessageHandler for the relay-level
// workspace snapshot change messages the relay client does not own.
func (s *Service) HandleRelayMessage(ctx context.Context, connState *rpc.Connection, nodeID string, method string, params json.RawMessage) bool {
	switch method {
	case relay.MethodWorkspaceSnapshotChanged:
		publishWorkspaceSnapshotChanged(s, params)
		return true
	default:
		return false
	}
}

// publishWorkspaceSnapshotChanged republishes relay workspace snapshot
// changes as frontend events. Cross-node workspace create/close envelopes are
// no longer acted on; they only trigger a frontend snapshot refresh.
func publishWorkspaceSnapshotChanged(handler *Service, params json.RawMessage) {
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

	handler.deps.Events.Publish(eventbus.Event{Topic: "workspaceSnapshotChanged", Payload: payload})
}
