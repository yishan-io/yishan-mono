package daemon

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/workspace"
)

type JSONRPCHandler struct {
	upgrader        websocket.Upgrader
	manager         *workspace.Manager
	nodeID          string
	createWorkspace func(context.Context, WorkspaceCreation) error
	events          *eventHub
}

func NewJSONRPCHandler(manager *workspace.Manager, nodeID string, createWorkspace func(context.Context, WorkspaceCreation) error) *JSONRPCHandler {
	return &JSONRPCHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
		manager:         manager,
		nodeID:          nodeID,
		createWorkspace: createWorkspace,
		events:          newEventHub(),
	}
}

func (h *JSONRPCHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("websocket upgrade failed")
		return
	}
	connState := newWSConnState(conn)
	defer connState.Close()

	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Error().Err(err).Msg("websocket read failed")
			}
			return
		}

		resp := h.handleRequest(r.Context(), connState, payload)
		if resp == nil {
			continue
		}

		if err := connState.WriteJSON(resp); err != nil {
			log.Error().Err(err).Msg("websocket write failed")
			return
		}
	}
}

func (h *JSONRPCHandler) handleRequest(ctx context.Context, connState *wsConnState, payload []byte) *response {
	var req request
	if err := json.Unmarshal(payload, &req); err != nil {
		return &response{JSONRPC: "2.0", Error: &rpcError{Code: -32700, Message: "parse error"}}
	}

	if req.JSONRPC != "2.0" {
		return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Error: &rpcError{Code: -32600, Message: "invalid request"}}
	}

	result, err := h.dispatch(ctx, connState, req.Method, req.Params)
	if err != nil {
		return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Error: mapRPCError(err)}
	}

	if len(req.ID) == 0 {
		return nil
	}

	return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Result: result}
}
