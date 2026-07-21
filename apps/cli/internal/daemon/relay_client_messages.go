package daemon

import (
	"encoding/json"
	"strings"

	"github.com/rs/zerolog/log"
	cliruntime "yishan/apps/cli/internal/runtime"
)

// handleRelayMessage handles relay-protocol messages (heartbeat, job dispatch).
// Returns true if the message was consumed and should not be passed to the daemon handler.
func handleRelayMessage(handler *JSONRPCHandler, runtime *cliruntime.Runtime, connState *wsConnState, nodeID string, payload []byte) bool {
	var msg struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params,omitempty"`
	}
	if err := json.Unmarshal(payload, &msg); err != nil {
		return false
	}

	switch msg.Method {
	case relayMethodPing:
		_ = connState.WriteJSON(notification{JSONRPC: "2.0", Method: relayMethodPong})
		return true
	case relayMethodJobRun:
		handleJobRun(runtime, connState, nodeID, msg.Params)
		return true
	case relayMethodWorkspaceSnapshotChanged:
		publishWorkspaceSnapshotChanged(handler, msg.Params)
		return true
	case relayMethodTerminalSessionChanged:
		publishTerminalSessionChanged(handler, msg.Params)
		return true
	case relayMethodTerminalStreamRequest:
		handleTerminalStreamRequest(handler, connState, msg.Params)
		return true
	case relayMethodTerminalStreamAccept:
		publishTerminalStreamAccept(handler, msg.Params)
		return true
	case relayMethodTerminalStreamCancel:
		publishTerminalStreamCancel(handler, msg.Params)
		return true
	default:
		return false
	}
}

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
