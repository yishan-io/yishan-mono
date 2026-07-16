package daemon

import (
	"context"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	cliruntime "yishan/apps/cli/internal/runtime"
)

func runRelaySession(handler *JSONRPCHandler, runtime *cliruntime.Runtime, nodeID string, conn *websocket.Conn) {
	connState := newWSConnState(conn)
	defer connState.Close()

	handler.relayConnMu.Lock()
	handler.relayConn = connState
	handler.relayConnMu.Unlock()
	defer func() {
		handler.relayConnMu.Lock()
		handler.relayConn = nil
		handler.relayConnMu.Unlock()
	}()

	subID, subEvents := handler.events.Subscribe()
	defer handler.events.Unsubscribe(subID)

	go forwardTerminalEventsToRelay(connState, subEvents)

	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure, websocket.CloseNormalClosure) {
				log.Warn().Err(err).Msg("relay websocket read failed")
			} else {
				log.Info().Err(err).Msg("relay websocket disconnected")
			}
			return
		}

		if msgType == websocket.BinaryMessage {
			handler.handleBinaryFrame(connState, payload)
			continue
		}

		// Handle relay-level messages before dispatching to the daemon handler.
		if handleRelayMessage(handler, runtime, connState, nodeID, payload) {
			continue
		}

		resp := handler.handleRequest(context.Background(), connState, payload)
		if resp == nil {
			continue
		}
		if err := connState.WriteJSON(resp); err != nil {
			log.Warn().Err(err).Msg("relay websocket write failed")
			return
		}
	}
}

func forwardTerminalEventsToRelay(connState *wsConnState, events <-chan frontendEvent) {
	for event := range events {
		if event.Topic != "terminalSessionChanged" {
			continue
		}
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			continue
		}
		notification := notification{
			JSONRPC: "2.0",
			Method:  relayMethodTerminalSessionChanged,
			Params:  payload,
		}
		if err := connState.WriteJSON(notification); err != nil {
			log.Warn().Err(err).Msg("relay: failed to forward terminal session changed")
			return
		}
	}
}
