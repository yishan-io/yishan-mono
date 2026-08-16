package rpc

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"

	relayprotocol "yishan/packages/relay-protocol-go"
)

const maxInFlightPerConnection = 16

// Handler processes one JSON-RPC method call.
type Handler interface {
	Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error)
}

// HandlerFunc adapts a plain function to Handler. It exists so tests and
// light-weight harnesses can construct an rpc.Server without implementing
// the Handler interface; production services use typed handlers instead.
type HandlerFunc func(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error)

// Call implements Handler.
func (f HandlerFunc) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	return f(ctx, connection, method, params)
}

// ConnectionHandler is implemented by handlers that want a hook when a
// WebSocket connection is established (e.g. desktop client tracking).
type ConnectionHandler interface {
	OnConnect(connection *Connection, request *http.Request)
}

// BinaryFrameHandler processes binary WebSocket frames (terminal I/O fast-path).
type BinaryFrameHandler interface {
	HandleBinaryFrame(connection *Connection, opcode byte, sessionID string, payload []byte)
}

// Server owns WebSocket connections and JSON-RPC request handling. It does not
// know about workspace, memory, usage, or agent implementations — the Handler
// interface decouples transport from the composed daemon services.
type Server struct {
	// Upgrader upgrades HTTP requests to WebSocket. Empty uses the default
	// (all origins allowed).
	Upgrader websocket.Upgrader
	// Handler dispatches JSON-RPC method calls. Required.
	Handler Handler
	// BinaryFrameHandler processes binary terminal I/O frames. Optional.
	BinaryFrameHandler BinaryFrameHandler
	// MaxInFlightPerConnection bounds concurrent JSON-RPC handlers per
	// connection. Zero uses the default (16).
	MaxInFlightPerConnection int
}

// NewServer creates a server around a handler with the default upgrader.
func NewServer(handler Handler) *Server {
	return &Server{
		Handler: handler,
		Upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
	}
}

// ServeHTTP upgrades the request and runs the JSON-RPC read loop.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := s.Upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("websocket upgrade failed")
		return
	}
	connection := NewConnection(conn)
	if onConnect, ok := s.Handler.(ConnectionHandler); ok {
		onConnect.OnConnect(connection, r)
	}
	defer connection.Close()
	connCtx, cancelConn := context.WithCancel(context.Background())
	defer cancelConn()

	maxInFlight := s.MaxInFlightPerConnection
	if maxInFlight <= 0 {
		maxInFlight = maxInFlightPerConnection
	}
	jsonRPCSem := make(chan struct{}, maxInFlight)
	var inFlight sync.WaitGroup
	defer inFlight.Wait()

	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Error().Err(err).Msg("websocket read failed")
			}
			return
		}

		// Binary frames are terminal I/O fast-path — skip JSON-RPC entirely.
		if msgType == websocket.BinaryMessage {
			s.HandleBinaryFrame(connection, payload)
			continue
		}

		// Dispatch JSON-RPC requests asynchronously so that slow handlers
		// never block the read loop (and therefore never starve terminal input).
		//
		// Use a connection-lifetime context rather than r.Context(). After the
		// WebSocket upgrade the HTTP request context is no longer meaningful —
		// it's tied to the upgrade request, not the WS lifetime. Each handler
		// method still manages its own timeout budget internally.
		jsonRPCSem <- struct{}{}
		inFlight.Add(1)
		go func(data []byte) {
			defer func() {
				<-jsonRPCSem
				inFlight.Done()
			}()

			resp := s.HandleMessage(connCtx, connection, data)
			if resp == nil {
				return
			}

			if err := connection.WriteJSON(resp); err != nil {
				log.Error().Err(err).Msg("websocket write failed")
			}
		}(payload)
	}
}

// HandleMessage decodes one JSON-RPC request, calls the handler, and builds
// the response. Returns nil for notifications (no id).
func (s *Server) HandleMessage(ctx context.Context, conn *Connection, payload []byte) *response {
	var req Request
	if err := json.Unmarshal(payload, &req); err != nil {
		return &response{JSONRPC: "2.0", Error: &RPCError{Code: CodeParseError, Message: "parse error"}}
	}

	if req.JSONRPC != "2.0" {
		return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Error: &RPCError{Code: CodeInvalidRequest, Message: "invalid request"}}
	}

	result, err := s.Handler.Call(ctx, conn, req.Method, req.Params)
	if err != nil {
		return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Error: MapRPCError(err)}
	}

	if len(req.ID) == 0 {
		return nil
	}

	return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Result: result}
}

// HandleBinaryFrame parses a binary WebSocket frame for terminal I/O.
// Frame format: [1 byte opcode] [session ID (null-terminated)] [payload]
func (s *Server) HandleBinaryFrame(conn *Connection, payload []byte) {
	if s.BinaryFrameHandler == nil {
		return
	}

	opcode, sessionID, _, ok := relayprotocol.DecodeBinaryFrame(payload)
	if !ok {
		return
	}
	// Resolve the session id through the connection cache so high-frequency
	// input frames do not reallocate the session id string per frame.
	s.BinaryFrameHandler.HandleBinaryFrame(conn, opcode, conn.TerminalInputSessionID(sessionID), payload)
}
