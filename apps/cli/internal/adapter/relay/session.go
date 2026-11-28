package relay

import (
	"context"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/rpc"
)

// runSession runs one relay connection session: it reads relay frames,
// answers relay heartbeats, and dispatches everything else to the rpc server.
func (c *Client) runSession(ctx context.Context, conn *websocket.Conn) {
	connState := rpc.NewConnection(conn)
	defer connState.Close()

	sessionDone := make(chan struct{})
	defer close(sessionDone)
	go closeSessionOnCancellation(ctx, connState, sessionDone)

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

		resp := c.server.HandleMessage(ctx, connState, payload)
		if resp == nil {
			continue
		}
		if err := connState.WriteJSON(resp); err != nil {
			log.Warn().Err(err).Msg("relay websocket write failed")
			return
		}
	}
}

// closeSessionOnCancellation closes the connection to unblock ReadMessage when
// the client context is canceled while the relay peer is idle.
func closeSessionOnCancellation(ctx context.Context, connState *rpc.Connection, sessionDone <-chan struct{}) {
	select {
	case <-ctx.Done():
		connState.Close()
	case <-sessionDone:
	}
}
