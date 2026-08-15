package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"yishan/apps/cli/internal/agentmanager"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/workspace"
	terminalruntime "yishan/apps/cli/internal/workspace/terminal"

	"github.com/rs/zerolog/log"
)

// piSessionState tracks the desktop connection and recovery metadata for one live pi session.
type piSessionState struct {
	connState   *wsConnState
	session     *agentmanager.Session
	tabID       string
	workspaceID string
	cwd         string
	// taskRun marks sessions started by a workspace-create task run. When such a
	// session exits before any client attaches, pi.start fails closed instead of
	// spawning a fresh idle twin that silently loses the task.
	taskRun bool
}

// piActiveSessionSummary describes one live pi session the desktop can recover.
// Session identity rule: the daemon live session id is also the Pi resume/session id.
type piActiveSessionSummary struct {
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId"`
	WorkspaceID string `json:"workspaceId"`
	CWD         string `json:"cwd"`
}

func (h *JSONRPCHandler) dispatchPi(ctx context.Context, connState *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodPiStart:
		return h.handlePiStart(ctx, connState, params)
	case MethodPiAttach:
		return h.handlePiAttach(ctx, connState, params)
	case MethodPiStop:
		return h.handlePiStop(params)
	case MethodPiSend:
		return h.handlePiSend(params)
	case MethodPiListSessions:
		return h.handlePiListSessions(ctx, params)
	case MethodPiListActiveSessions:
		return h.handlePiListActiveSessions()
	case MethodPiGetSessionFile:
		return h.handlePiGetSessionFile(ctx, params)
	case MethodPiRename:
		return h.handlePiRename(params)
	case MethodPiListProviders:
		return h.handlePiListProviders()
	case MethodPiSaveProvider:
		return h.handlePiSaveProvider(params)
	case MethodPiRemoveProvider:
		return h.handlePiRemoveProvider(params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown pi method: "+method)
	}
}

type piStartParams struct {
	// Session identity rule: sessionId is used both for daemon attach and Pi resume.
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId"`
	PaneID      string `json:"paneId,omitempty"`
	WorkspaceID string `json:"workspaceId"`
	CWD         string `json:"cwd"`
	Resume      bool   `json:"resume,omitempty"`
}

// piStopWaitTimeout bounds how long pi.start waits for an in-flight pi.stop of
// the same session id before giving up and reporting ErrSessionExists.
const piStopWaitTimeout = 10 * time.Second

// stoppingMarkGracePeriod is how long pi.start waits to observe the stopping
// marker before concluding the session is a genuinely live session (not being
// torn down) and giving up on the wait. The marker is set microseconds after
// the pi.stop RPC arrives, so a short grace is ample.
const stoppingMarkGracePeriod = 150 * time.Millisecond

func (h *JSONRPCHandler) handlePiStart(ctx context.Context, connState *wsConnState, params json.RawMessage) (any, error) {
	var req piStartParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}
	if req.CWD == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "cwd is required")
	}

	// A fast reopen of the same session id can race an in-flight pi.stop for
	// that id (teardown holds the id for up to abortGracePeriod). Wait for the
	// teardown to finish so the reopen starts a fresh process instead of
	// reporting ErrSessionExists or attaching to a process being killed. The
	// wait runs again after ErrSessionExists below because the stop's marker
	// may be set after this first check.
	h.waitForStoppingSession(ctx, req.SessionID)

	// A task-run session whose pi process exited before any client attached
	// leaves a stale registry entry (readStdout only unregisters the process
	// manager). Its prompt was already consumed by the dead process, so
	// spawning a fresh process under the same session id would produce a
	// silent idle tab that never ran the task. Fail closed instead.
	h.piSessionsMu.Lock()
	taskRunState, exists := h.piSessions[req.SessionID]
	h.piSessionsMu.Unlock()
	if exists && taskRunState.taskRun {
		if _, alive := h.agentMgr.Session(req.SessionID); !alive {
			h.piSessionsMu.Lock()
			delete(h.piSessions, req.SessionID)
			h.piSessionsMu.Unlock()
			log.Warn().Str("sessionId", req.SessionID).Msg("pi.start: task run session ended before attach")
			return nil, workspace.NewRPCError(rpcCodeNotFound, "task run session ended before it could be attached: "+req.SessionID)
		}
	}

	args := []string{"--mode", "rpc", "--name", req.TabID, "--approve"}
	if req.Resume {
		args = append(args, "--session", req.SessionID)
	} else {
		args = append(args, "--session-id", req.SessionID)
	}

	extraEnv, err := buildPiStartExtraEnv(req)
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	opts := agentmanager.StartOptions{
		SessionID:   req.SessionID,
		TabID:       req.TabID,
		WorkspaceID: req.WorkspaceID,
		Binary:      "pi",
		Args:        args,
		CWD:         req.CWD,
		ExtraEnv:    extraEnv,
		OnEvent:     h.makePiEventCallback(req.SessionID),
		OnExit:      h.handlePiSessionExit,
	}

	// Pi sessions are owned by the daemon, not the desktop WebSocket. A laptop
	// sleep can close the WebSocket temporarily; app.Close cancels the agent
	// lifecycle context and stops all sessions on daemon shutdown.
	if err := h.agentLifecycleCtx.Err(); err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "daemon is shutting down")
	}
	session, err := h.agentMgr.Start(h.agentLifecycleCtx, opts)
	if err != nil {
		if errors.Is(err, agentmanager.ErrSessionExists) {
			// The existing session may be mid-teardown (its pi.stop began after
			// our first wait above). Wait for the teardown to release the id,
			// then start a fresh process so a fast reopen works regardless of
			// RPC ordering.
			if h.waitForStoppingSession(ctx, req.SessionID) {
				session, err = h.agentMgr.Start(h.agentLifecycleCtx, opts)
			}
		}
		if err != nil {
			if errors.Is(err, agentmanager.ErrSessionExists) {
				return nil, workspace.NewRPCError(rpcCodeSessionExists, err.Error())
			}
			return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
		}
	}

	h.piSessionsMu.Lock()
	h.piSessions[req.SessionID] = &piSessionState{
		connState:   connState,
		session:     session,
		tabID:       req.TabID,
		workspaceID: req.WorkspaceID,
		cwd:         req.CWD,
	}
	h.piSessionsMu.Unlock()

	// A process that exited before the registry insert (instant crash) would
	// otherwise lose its session_end notification: its OnExit ran before the
	// entry existed. Fire the exit handler now that the entry is in place.
	if _, alive := h.agentMgr.Session(req.SessionID); !alive {
		h.handlePiSessionExit(session)
	}

	return map[string]any{"sessionId": req.SessionID}, nil
}

type piAttachParams struct {
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	CWD         string `json:"cwd,omitempty"`
}

// attachStartWaitTimeout bounds how long pi.attach waits for a concurrent
// pi.start of the same session id to finish spawning.
const attachStartWaitTimeout = 2 * time.Second

func (h *JSONRPCHandler) handlePiAttach(ctx context.Context, connState *wsConnState, params json.RawMessage) (any, error) {
	var req piAttachParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}

	// Never rebind to a session that is mid-teardown: the pi.stop that follows
	// would delete the registry entry under the newly attached tab.
	h.piSessionsMu.Lock()
	_, isStopping := h.stoppingPiSessions[req.SessionID]
	h.piSessionsMu.Unlock()
	if isStopping {
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session is stopping: "+req.SessionID)
	}

	// A concurrent pi.start for the same id (e.g. two tabs opening the same
	// history session at once) may still be spawning: the id is reserved in the
	// manager but the session is not registered yet. Wait for it so the second
	// opener attaches to the winning process instead of failing with
	// "pi session not found".
	if _, exists := h.agentMgr.Session(req.SessionID); !exists {
		if !h.waitForSessionStart(ctx, req.SessionID) {
			h.piSessionsMu.Lock()
			delete(h.piSessions, req.SessionID)
			h.piSessionsMu.Unlock()
			return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
		}
	}

	// Re-check the stopping marker: a pi.stop may have started while we waited
	// for the concurrent start, and its teardown would delete the entry under a
	// newly attached tab.
	h.piSessionsMu.Lock()
	_, isStopping = h.stoppingPiSessions[req.SessionID]
	h.piSessionsMu.Unlock()
	if isStopping {
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session is stopping: "+req.SessionID)
	}

	h.piSessionsMu.Lock()
	state, exists := h.piSessions[req.SessionID]
	if !exists {
		h.piSessionsMu.Unlock()
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
	}
	state.connState = connState
	if strings.TrimSpace(req.TabID) != "" {
		state.tabID = req.TabID
	}
	if strings.TrimSpace(req.WorkspaceID) != "" {
		state.workspaceID = req.WorkspaceID
	}
	if strings.TrimSpace(req.CWD) != "" {
		state.cwd = req.CWD
	}
	h.piSessionsMu.Unlock()

	return map[string]bool{"ok": true}, nil
}

type piStopParams struct {
	SessionID string `json:"sessionId"`
}

func buildPiStartExtraEnv(req piStartParams) ([]string, error) {
	piAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi agent dir: %w", err)
	}

	env := terminalruntime.ResolveObserverSessionEnv(
		nil,
		req.WorkspaceID,
		req.TabID,
		resolvePiStartPaneID(req.TabID, req.PaneID),
	)
	return append(env, config.PiAgentDirEnvKey+"="+piAgentDir), nil
}

func resolvePiStartPaneID(tabID string, paneID string) string {
	normalizedPaneID := strings.TrimSpace(paneID)
	if normalizedPaneID != "" {
		return normalizedPaneID
	}
	if strings.TrimSpace(tabID) == "" {
		return ""
	}
	return "pane-" + tabID
}

// waitForStoppingSession blocks while the given session id is being torn down
// by an in-flight pi.stop, so a concurrent pi.start can reuse the id as soon as
// it is released. It returns true once the session has been released (or is
// already absent). It returns false without waiting when the session is never
// marked as stopping (a genuinely live session) or when the context is done or
// the wait times out — the caller then reports ErrSessionExists.
func (h *JSONRPCHandler) waitForStoppingSession(ctx context.Context, sessionID string) bool {
	startedAt := time.Now()
	deadline := startedAt.Add(piStopWaitTimeout)
	sawStopping := false
	for {
		h.piSessionsMu.Lock()
		_, isStopping := h.stoppingPiSessions[sessionID]
		h.piSessionsMu.Unlock()
		sawStopping = sawStopping || isStopping

		if _, exists := h.agentMgr.Session(sessionID); !exists {
			return true // released (mid-stop teardown finished, or already absent)
		}
		// The session still exists but was never marked as stopping: it is a
		// live session, not a teardown — stop waiting so the caller reports
		// ErrSessionExists and the frontend attaches to it.
		if !sawStopping && time.Since(startedAt) > stoppingMarkGracePeriod {
			return false
		}
		if time.Now().After(deadline) {
			return sawStopping
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(50 * time.Millisecond):
		}
	}
}

// waitForSessionStart polls until the given session id is fully registered
// (spawned in the process manager and present in the pi registry) — i.e. a
// concurrent pi.start finished. It only waits while a start for the id is
// genuinely in flight and returns false when the id is not being started, the
// context is done, or the wait times out.
func (h *JSONRPCHandler) waitForSessionStart(ctx context.Context, sessionID string) bool {
	deadline := time.Now().Add(attachStartWaitTimeout)
	for {
		if h.sessionFullyRegistered(sessionID) {
			return true
		}
		if !h.agentMgr.Starting(sessionID) {
			// The winner may have completed its register-and-release between our
			// two reads; do one final check before declaring the session absent.
			return h.sessionFullyRegistered(sessionID)
		}
		if time.Now().After(deadline) {
			return false
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(50 * time.Millisecond):
		}
	}
}

// sessionFullyRegistered reports whether the session is both spawned in the
// process manager and registered in the pi session registry. The registry write
// happens just after the spawn, so an attach must wait for both.
func (h *JSONRPCHandler) sessionFullyRegistered(sessionID string) bool {
	if _, exists := h.agentMgr.Session(sessionID); !exists {
		return false
	}
	h.piSessionsMu.Lock()
	_, exists := h.piSessions[sessionID]
	h.piSessionsMu.Unlock()
	return exists
}

func (h *JSONRPCHandler) handlePiStop(params json.RawMessage) (any, error) {
	var req piStopParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}

	// Mark the session as stopping before the (potentially slow) process
	// teardown so concurrent pi.start/pi.attach cannot bind to a dying process.
	h.piSessionsMu.Lock()
	if _, exists := h.piSessions[req.SessionID]; exists {
		h.stoppingPiSessions[req.SessionID] = struct{}{}
	}
	h.piSessionsMu.Unlock()

	if err := h.agentMgr.Stop(req.SessionID); err != nil {
		h.piSessionsMu.Lock()
		delete(h.stoppingPiSessions, req.SessionID)
		h.piSessionsMu.Unlock()
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	h.piSessionsMu.Lock()
	delete(h.piSessions, req.SessionID)
	delete(h.stoppingPiSessions, req.SessionID)
	h.piSessionsMu.Unlock()

	return map[string]bool{"ok": true}, nil
}

type piSendParams struct {
	SessionID string          `json:"sessionId"`
	Command   json.RawMessage `json:"command"`
}

func (h *JSONRPCHandler) handlePiSend(params json.RawMessage) (any, error) {
	var req piSendParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}
	if len(req.Command) == 0 {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "command is required")
	}

	h.piSessionsMu.Lock()
	state, exists := h.piSessions[req.SessionID]
	h.piSessionsMu.Unlock()

	if !exists {
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
	}

	if err := state.session.Send(req.Command); err != nil {
		// A dead process leaves the registry entry behind until the next
		// stop/attach; report it as not-found so clients recover by re-starting
		// instead of surfacing a raw pipe error.
		if errors.Is(err, agentmanager.ErrStdinClosed) {
			return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
		}
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	return map[string]bool{"ok": true}, nil
}

type piListSessionsParams struct {
	CWD string `json:"cwd"`
}

func (h *JSONRPCHandler) handlePiListSessions(ctx context.Context, params json.RawMessage) (any, error) {
	var req piListSessionsParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.CWD) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "cwd is required")
	}

	summaries, err := agentmanager.ListSessionSummaries(ctx, req.CWD)
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	return summaries, nil
}

type piGetSessionFileParams struct {
	CWD       string `json:"cwd"`
	SessionID string `json:"sessionId"`
}

func (h *JSONRPCHandler) handlePiGetSessionFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req piGetSessionFileParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.CWD) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "cwd is required")
	}
	if strings.TrimSpace(req.SessionID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}

	filePath, err := agentmanager.FindSessionFile(ctx, req.CWD, req.SessionID)
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	return map[string]string{"filePath": filePath}, nil
}

type piRenameParams struct {
	SessionID string `json:"sessionId"`
	Title     string `json:"title"`
}

func (h *JSONRPCHandler) handlePiRename(params json.RawMessage) (any, error) {
	var req piRenameParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}
	if req.Title == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "title is required")
	}

	h.piSessionsMu.Lock()
	state, exists := h.piSessions[req.SessionID]
	h.piSessionsMu.Unlock()

	if !exists {
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
	}

	renameCmd, err := json.Marshal(map[string]string{
		"type": "set_session_name",
		"name": req.Title,
	})
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	if err := state.session.Send(renameCmd); err != nil {
		// A dead process leaves the registry entry behind until the next
		// stop/attach; report it as not-found so clients recover by re-starting
		// instead of surfacing a raw pipe error.
		if errors.Is(err, agentmanager.ErrStdinClosed) {
			return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
		}
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) handlePiListActiveSessions() (any, error) {
	activeSessions := h.agentMgr.Sessions()
	if len(activeSessions) == 0 {
		return []piActiveSessionSummary{}, nil
	}

	h.piSessionsMu.Lock()
	metadataBySessionID := make(map[string]*piSessionState, len(h.piSessions))
	for sessionID, state := range h.piSessions {
		metadataBySessionID[sessionID] = state
	}
	h.piSessionsMu.Unlock()

	summaries := make([]piActiveSessionSummary, 0, len(activeSessions))
	for _, session := range activeSessions {
		metadata, exists := metadataBySessionID[session.ID()]
		if !exists {
			continue
		}

		summaries = append(summaries, piActiveSessionSummary{
			SessionID:   session.ID(),
			TabID:       metadata.tabID,
			WorkspaceID: metadata.workspaceID,
			CWD:         metadata.cwd,
		})
	}

	return summaries, nil
}

// makePiEventCallback returns an OnEvent callback that forwards pi stdout events
// to the desktop WebSocket connection.
func (h *JSONRPCHandler) makePiEventCallback(sessionID string) func(string, string, string, []byte) {
	return func(_ string, tabID string, workspaceID string, event []byte) {
		h.piSessionsMu.Lock()
		state, exists := h.piSessions[sessionID]
		var connState *wsConnState
		resolvedTabID := tabID
		resolvedWorkspaceID := workspaceID
		if exists {
			connState = state.connState
			if strings.TrimSpace(state.tabID) != "" {
				resolvedTabID = state.tabID
			}
			if strings.TrimSpace(state.workspaceID) != "" {
				resolvedWorkspaceID = state.workspaceID
			}
		}
		h.piSessionsMu.Unlock()

		if !exists || connState == nil {
			return
		}

		// Forward as a frontend event notification.
		_ = connState.Notify(MethodFrontendEventsStream, map[string]any{
			"topic": "agent.pi.event",
			"payload": map[string]any{
				"sessionId":   sessionID,
				"tabId":       resolvedTabID,
				"workspaceId": resolvedWorkspaceID,
				"event":       json.RawMessage(event),
			},
		})
	}
}

// handlePiSessionExit forwards a session_end event to the desktop when a pi
// process exits. It only fires for the exact process still registered in
// h.piSessions: a newer process that took over the same session id (fast reopen)
// leaves the event unsent, and a clean pi.stop is ignored by the desktop because
// its event router is already unsubscribed by then. The stale registry entry is
// intentionally kept so the task-run fail-closed guard in handlePiStart can
// still detect a session that died before attach; pi.start overwrites it and
// pi.attach self-heals.
func (h *JSONRPCHandler) handlePiSessionExit(exited *agentmanager.Session) {
	h.piSessionsMu.Lock()
	state, exists := h.piSessions[exited.ID()]
	if !exists || state.session != exited {
		h.piSessionsMu.Unlock()
		return
	}
	connState := state.connState
	tabID := state.tabID
	workspaceID := state.workspaceID
	h.piSessionsMu.Unlock()

	if connState == nil || connState.conn == nil {
		return
	}

	// Re-check ownership just before sending: a concurrent pi.attach may have
	// rebound the session to a different connection; never notify a stale one.
	h.piSessionsMu.Lock()
	current, stillExists := h.piSessions[exited.ID()]
	if !stillExists || current.session != exited || current.connState != connState {
		h.piSessionsMu.Unlock()
		return
	}
	h.piSessionsMu.Unlock()

	_ = connState.Notify(MethodFrontendEventsStream, map[string]any{
		"topic": "agent.pi.event",
		"payload": map[string]any{
			"sessionId":   exited.ID(),
			"tabId":       tabID,
			"workspaceId": workspaceID,
			"event":       json.RawMessage(`{"type":"session_end"}`),
		},
	})
}
