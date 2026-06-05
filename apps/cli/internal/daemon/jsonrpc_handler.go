package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/workspace"
)

const (
	// Binary frame opcodes for terminal I/O fast-path.
	binOpcodeTerminalInput    byte = 0x01
	binOpcodeTerminalOutput   byte = 0x02
	maxInFlightJSONRPCPerConn      = 16
)

type JSONRPCHandler struct {
	upgrader       websocket.Upgrader
	manager        *workspace.Manager
	nodeID         string
	logFilePath    string
	cleanupStore   *workspaceCleanupStore
	events         *eventHub
	watchers       *workspaceWatchers
	prTracker      *workspacePRTracker
	tokenUsage     *tokenUsageCollector
	fileCacheSubID uint64
}

func NewJSONRPCHandler(manager *workspace.Manager, nodeID string, logFilePath string, cleanupStore *workspaceCleanupStore, configPath string) *JSONRPCHandler {
	events := newEventHub()
	prTracker := newWorkspacePRTracker(manager, events.Publish)
	fileCacheSubID, fileCacheEvents := events.Subscribe()
	collector, err := newTokenUsageCollector(manager, configPath)
	if err != nil {
		log.Warn().Err(err).Msg("failed to initialize token usage collector")
	}
	manager.SetTerminalDetectedPortsListener(func(ports []workspace.TerminalDetectedPort) {
		events.Publish(frontendEvent{
			Topic: "terminalDetectedPortsChanged",
			Payload: map[string]any{
				"ports": ports,
			},
		})
	})
	handler := &JSONRPCHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
		manager:        manager,
		nodeID:         nodeID,
		logFilePath:    logFilePath,
		cleanupStore:   cleanupStore,
		events:         events,
		watchers:       newWorkspaceWatchers(events, prTracker.RefreshWorkspaceByPath),
		prTracker:      prTracker,
		tokenUsage:     collector,
		fileCacheSubID: fileCacheSubID,
	}
	go handler.consumeFileCacheInvalidationEvents(fileCacheEvents)
	return handler
}

// Shutdown stops background goroutines owned by the handler (PR tracker poll loop).
// It must be called when the daemon server shuts down.
func (h *JSONRPCHandler) Shutdown() {
	h.events.Unsubscribe(h.fileCacheSubID)
	h.prTracker.Stop()
	if h.tokenUsage != nil {
		h.tokenUsage.Close()
	}
}

func (h *JSONRPCHandler) consumeFileCacheInvalidationEvents(events <-chan frontendEvent) {
	for event := range events {
		if event.Topic != "workspaceFilesChanged" {
			continue
		}
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			continue
		}
		worktreePath, _ := payload["workspaceWorktreePath"].(string)
		changedPaths, _ := payload["changedRelativePaths"].([]string)
		if worktreePath == "" || len(changedPaths) == 0 {
			continue
		}
		h.manager.InvalidateWorkspaceFileCacheByPath(worktreePath, changedPaths)
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
	connCtx, cancelConn := context.WithCancel(context.Background())
	defer cancelConn()

	jsonRPCSem := make(chan struct{}, maxInFlightJSONRPCPerConn)
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
			h.handleBinaryFrame(connState, payload)
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

			resp := h.handleRequest(connCtx, connState, data)
			if resp == nil {
				return
			}

			if err := connState.WriteJSON(resp); err != nil {
				log.Error().Err(err).Msg("websocket write failed")
			}
		}(payload)
	}
}

// handleBinaryFrame processes a binary WebSocket frame for terminal I/O.
// Frame format: [1 byte opcode] [session ID (null-terminated)] [payload]
func (h *JSONRPCHandler) handleBinaryFrame(connState *wsConnState, payload []byte) {
	if len(payload) < 3 { // minimum: opcode + at least 1 char session ID + null terminator
		return
	}

	opcode := payload[0]
	rest := payload[1:]

	switch opcode {
	case binOpcodeTerminalInput:
		// Find the null-terminated session ID.
		nullIdx := bytes.IndexByte(rest, 0)
		if nullIdx < 0 {
			return
		}
		sessionID := connState.terminalInputSessionID(rest[:nullIdx])
		inputData := rest[nullIdx+1:]
		if len(inputData) == 0 {
			return
		}
		// Write raw bytes directly to PTY — avoids JSON unmarshal + string conversion.
		h.manager.TerminalSendRaw(sessionID, inputData)
	}
}

func (h *JSONRPCHandler) handleRequest(ctx context.Context, connState *wsConnState, payload []byte) *response {
	var req request
	if err := json.Unmarshal(payload, &req); err != nil {
		return &response{JSONRPC: "2.0", Error: &rpcError{Code: rpcCodeParseError, Message: "parse error"}}
	}

	if req.JSONRPC != "2.0" {
		return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Error: &rpcError{Code: rpcCodeInvalidRequest, Message: "invalid request"}}
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
