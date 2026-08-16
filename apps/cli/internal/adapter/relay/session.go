package relay

import (
	"context"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/rpc"
)

// runSession runs one relay connection session: it publishes terminal session
// changes to the relay, reads relay frames, routes relay-level messages to the
// handler, and dispatches everything else to the rpc server.
func (c *Client) runSession(ctx context.Context, conn *websocket.Conn) {
	connState := rpc.NewConnection(conn)
	defer connState.Close()

	c.connMu.Lock()
	c.conn = connState
	c.connMu.Unlock()
	defer func() {
		c.connMu.Lock()
		c.conn = nil
		c.connMu.Unlock()
	}()

	subID, subEvents := c.events.Subscribe()
	defer c.events.Unsubscribe(subID)

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
			c.server.HandleBinaryFrame(connState, payload)
			continue
		}

		// Handle relay-level messages before dispatching to the rpc server.
		if c.handleRelayMessage(connState, payload) {
			continue
		}

		resp := c.server.HandleMessage(context.Background(), connState, payload)
		if resp == nil {
			continue
		}
		if err := connState.WriteJSON(resp); err != nil {
			log.Warn().Err(err).Msg("relay websocket write failed")
			return
		}
	}
}

// forwardTerminalEventsToRelay publishes local terminal session lifecycle
// changes to the relay so remote nodes can track sessions.
func forwardTerminalEventsToRelay(connState *rpc.Connection, events <-chan eventbus.Event) {
	for event := range events {
		if event.Topic != "terminalSessionChanged" {
			continue
		}
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			continue
		}
		notification := rpc.Notification{
			JSONRPC: "2.0",
			Method:  MethodTerminalSessionChanged,
			Params:  payload,
		}
		if err := connState.WriteJSON(notification); err != nil {
			log.Warn().Err(err).Msg("relay: failed to forward terminal session changed")
			return
		}
	}
}
