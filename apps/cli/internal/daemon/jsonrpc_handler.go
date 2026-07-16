package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/agentmanager"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/modellist"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"
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
	runtime        *cliruntime.Runtime
	nodeID         string
	logFilePath    string
	cleanupStore   *workspaceCleanupStore
	wsIndexStore   *workspaceIndexStore
	context        *AppContextStore
	events         *eventHub
	watchers       *workspacewatchers.Watchers
	prTracker      *workspacePRTracker
	tokenUsage     tokenUsageService
	computer       *computerService
	modelList      *modellist.Service
	memory         *memory.Service
	agentMgr       *agentmanager.Manager
	settingsPath   string
	serverCtx      context.Context
	fileCacheSubID uint64

	agentUsageMu sync.Mutex
	agentUsage   map[string]map[string]struct{}

	piSessionsMu sync.Mutex
	piSessions   map[string]*piSessionState

	remoteStreamMu   sync.Mutex
	remoteStreamSubs map[string]map[*wsConnState]struct{}

	// relayConn is the active relay WebSocket connection, set while a relay
	// session is running. Used by terminal.remote.subscribe to send stream
	// requests to the relay on behalf of the desktop.
	relayConnMu sync.RWMutex
	relayConn   *wsConnState
}

func NewJSONRPCHandler(manager *workspace.Manager, runtime *cliruntime.Runtime, nodeID string, logFilePath string, cleanupStore *workspaceCleanupStore, wsIndexStore *workspaceIndexStore, configPath string, context *AppContextStore) *JSONRPCHandler {
	events := newEventHub()
	prTracker := newWorkspacePRTracker(manager, runtime, events.Publish)
	fileCacheSubID, fileCacheEvents := events.Subscribe()
	collector, err := newTokenUsageCollector(manager, runtime, configPath)
	if err != nil {
		log.Warn().Err(err).Msg("failed to initialize token usage collector")
	}
	manager.Terminals().SetPortsChangedListener(func(ports []workspace.TerminalDetectedPort) {
		events.Publish(frontendEvent{
			Topic: "terminalDetectedPortsChanged",
			Payload: map[string]any{
				"ports": ports,
			},
		})
	})
	manager.Terminals().SetSessionsChangedListener(func(event workspace.TerminalSessionLifecycleEvent) {
		events.Publish(frontendEvent{
			Topic: "terminalSessionChanged",
			Payload: map[string]any{
				"action":      event.Action,
				"sessionId":   event.SessionID,
				"workspaceId": event.WorkspaceID,
				"tabId":       event.TabID,
				"paneId":      event.PaneID,
				"pid":         event.PID,
				"status":      event.Status,
				"startedAt":   event.StartedAt,
			},
		})
	})
	handler := &JSONRPCHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
		manager:          manager,
		runtime:          runtime,
		nodeID:           nodeID,
		logFilePath:      logFilePath,
		cleanupStore:     cleanupStore,
		wsIndexStore:     wsIndexStore,
		context:          context,
		events:           events,
		watchers:         newWorkspaceWatchersForEventHub(events, prTracker.RefreshWorkspaceByPath),
		prTracker:        prTracker,
		tokenUsage:       collector,
		computer:         newComputerService(computer.NewUnavailableRuntime("unknown")),
		modelList:        modellist.NewService(),
		agentMgr:         agentmanager.NewManager(),
		settingsPath:     config.SettingsFilePath(filepath.Dir(configPath)),
		agentUsage:       make(map[string]map[string]struct{}),
		piSessions:       make(map[string]*piSessionState),
		remoteStreamSubs: make(map[string]map[*wsConnState]struct{}),
		fileCacheSubID:   fileCacheSubID,
	}
	go handler.consumeFileCacheInvalidationEvents(fileCacheEvents)
	return handler
}

func (h *JSONRPCHandler) SetComputerService(svc *computerService) {
	if svc == nil {
		return
	}
	h.computer = svc
}

// SetMemoryService wires the memory service into the handler.
func (h *JSONRPCHandler) SetMemoryService(svc *memory.Service, ctx context.Context) {
	h.memory = svc
	h.serverCtx = ctx
}

// Shutdown stops background goroutines owned by the handler (PR tracker poll loop, token usage, memory).
// It must be called when the daemon server shuts down.
func (h *JSONRPCHandler) Shutdown() {
	h.events.Unsubscribe(h.fileCacheSubID)
	h.prTracker.Stop()
	if h.tokenUsage != nil {
		h.tokenUsage.Close()
	}
	if h.memory != nil {
		h.memory.Close()
	}
	if h.agentMgr != nil {
		h.agentMgr.StopAll()
	}
	modellist.ShutdownShell()
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
		if h.memory != nil {
			h.forwardMemoryFileChanges(worktreePath, changedPaths)
		}
	}
}

func (h *JSONRPCHandler) forwardMemoryFileChanges(worktreePath string, relPaths []string) {
	// Resolve projectID from the registered workspace (best-effort; empty is fine).
	projectID := ""
	if ws, err := h.manager.WorkspaceHandleByPath(worktreePath); err == nil {
		projectID = ws.Workspace().ProjectID
	}
	for _, rel := range relPaths {
		abs := filepath.Join(worktreePath, rel)
		// Resolve symlinks before the ShouldIndex check: .my-context/ inside a
		// worktree is a symlink to ~/.yishan/contexts/…, so the unresolved abs
		// path contains "/.yishan/worktrees/" and would never match the filter.
		// EvalSymlinks fails for deleted files; in that case resolved stays as
		// abs and ShouldIndex will return false — delete events for context files
		// are not currently propagated via this path (pre-existing limitation).
		resolved := abs
		if r, err := filepath.EvalSymlinks(abs); err == nil {
			resolved = r
		}
		if h.memory.ShouldIndex(resolved) {
			if err := h.memory.OnFileChanged(abs, worktreePath, projectID); err != nil {
				log.Warn().Err(err).Str("path", abs).Msg("memory index update failed")
			}
		}
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
	nullIdx := bytes.IndexByte(rest, 0)
	if nullIdx < 0 {
		return
	}
	sessionID := connState.terminalInputSessionID(rest[:nullIdx])

	switch opcode {
	case binOpcodeTerminalInput:
		inputData := rest[nullIdx+1:]
		if len(inputData) == 0 {
			return
		}
		if h.forwardRemoteTerminalInput(sessionID, payload) {
			return
		}
		// Write raw bytes directly to PTY — avoids JSON unmarshal + string conversion.
		h.manager.Terminals().SendRaw(sessionID, inputData)
	case binOpcodeTerminalOutput:
		h.forwardRemoteTerminalOutput(sessionID, payload)
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
