package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
	terminalruntime "yishan/apps/cli/internal/workspace/terminal"

	"github.com/rs/zerolog/log"
)

// piActiveSessionSummary describes one live pi session the desktop can recover.
// Session identity rule: the daemon live session id is also the Pi resume/session id.
type piActiveSessionSummary struct {
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId"`
	WorkspaceID string `json:"workspaceId"`
	CWD         string `json:"cwd"`
}

func (h *JSONRPCHandler) dispatchPi(ctx context.Context, connState *rpc.Connection, method string, params json.RawMessage) (any, error) {
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

func (h *JSONRPCHandler) handlePiStart(ctx context.Context, connState *rpc.Connection, params json.RawMessage) (any, error) {
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
	h.piSessions.WaitForStopping(ctx, h.agentMgr, req.SessionID)

	// A task-run session whose pi process exited before any client attached
	// leaves a stale registry entry (readStdout only unregisters the process
	// manager). Its prompt was already consumed by the dead process, so
	// spawning a fresh process under the same session id would produce a
	// silent idle tab that never ran the task. Fail closed instead.
	taskRunState, exists := h.piSessions.Get(req.SessionID)
	if exists && taskRunState.TaskRun {
		if _, alive := h.agentMgr.Session(req.SessionID); !alive {
			h.piSessions.Delete(req.SessionID)
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

	opts := process.StartOptions{
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
	proc, err := h.agentMgr.Start(h.agentLifecycleCtx, opts)
	if err != nil {
		if errors.Is(err, process.ErrSessionExists) {
			// The existing session may be mid-teardown (its pi.stop began after
			// our first wait above). Wait for the teardown to release the id,
			// then start a fresh process so a fast reopen works regardless of
			// RPC ordering.
			if h.piSessions.WaitForStopping(ctx, h.agentMgr, req.SessionID) {
				proc, err = h.agentMgr.Start(h.agentLifecycleCtx, opts)
			}
		}
		if err != nil {
			if errors.Is(err, process.ErrSessionExists) {
				return nil, workspace.NewRPCError(rpcCodeSessionExists, err.Error())
			}
			return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
		}
	}

	h.piSessions.Register(req.SessionID, connState, proc, req.TabID, req.WorkspaceID, req.CWD, false)

	// A process that exited before the registry insert (instant crash) would
	// otherwise lose its session_end notification: its OnExit ran before the
	// entry existed. Fire the exit handler now that the entry is in place.
	if _, alive := h.agentMgr.Session(req.SessionID); !alive {
		h.handlePiSessionExit(proc)
	}

	return map[string]any{"sessionId": req.SessionID}, nil
}

type piAttachParams struct {
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	CWD         string `json:"cwd,omitempty"`
}

func (h *JSONRPCHandler) handlePiAttach(ctx context.Context, connState *rpc.Connection, params json.RawMessage) (any, error) {
	var req piAttachParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}

	// Never rebind to a session that is mid-teardown: the pi.stop that follows
	// would delete the registry entry under the newly attached tab.
	if h.piSessions.IsStopping(req.SessionID) {
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session is stopping: "+req.SessionID)
	}

	// A concurrent pi.start for the same id (e.g. two tabs opening the same
	// history session at once) may still be spawning: the id is reserved in the
	// manager but the session is not registered yet. Wait for it so the second
	// opener attaches to the winning process instead of failing with
	// "pi session not found".
	if _, exists := h.agentMgr.Session(req.SessionID); !exists {
		if !h.piSessions.WaitForStart(ctx, h.agentMgr, req.SessionID) {
			h.piSessions.Delete(req.SessionID)
			return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
		}
	}

	// Re-check the stopping marker: a pi.stop may have started while we waited
	// for the concurrent start, and its teardown would delete the entry under a
	// newly attached tab.
	if h.piSessions.IsStopping(req.SessionID) {
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session is stopping: "+req.SessionID)
	}

	if _, exists := h.piSessions.Attach(req.SessionID, connState, req.TabID, req.WorkspaceID, req.CWD); !exists {
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
	}

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
	if !h.piSessions.MarkStopping(req.SessionID) {
		// Nothing to stop; still report ok so the desktop can clean up.
		return map[string]bool{"ok": true}, nil
	}

	if err := h.agentMgr.Stop(req.SessionID); err != nil {
		h.piSessions.UnmarkStopping(req.SessionID)
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	h.piSessions.Delete(req.SessionID)
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

	state, exists := h.piSessions.Get(req.SessionID)
	if !exists {
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
	}

	if err := state.Process.Send(req.Command); err != nil {
		// A dead process leaves the registry entry behind until the next
		// stop/attach; report it as not-found so clients recover by re-starting
		// instead of surfacing a raw pipe error.
		if errors.Is(err, process.ErrStdinClosed) {
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

	summaries, err := process.ListSessionSummaries(ctx, req.CWD)
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

	filePath, err := process.FindSessionFile(ctx, req.CWD, req.SessionID)
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

	state, exists := h.piSessions.Get(req.SessionID)
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

	if err := state.Process.Send(renameCmd); err != nil {
		// A dead process leaves the registry entry behind until the next
		// stop/attach; report it as not-found so clients recover by re-starting
		// instead of surfacing a raw pipe error.
		if errors.Is(err, process.ErrStdinClosed) {
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

	metadataBySessionID := h.piSessions.Snapshot()

	summaries := make([]piActiveSessionSummary, 0, len(activeSessions))
	for _, proc := range activeSessions {
		metadata, exists := metadataBySessionID[proc.ID()]
		if !exists {
			continue
		}

		summaries = append(summaries, piActiveSessionSummary{
			SessionID:   proc.ID(),
			TabID:       metadata.TabID,
			WorkspaceID: metadata.WorkspaceID,
			CWD:         metadata.CWD,
		})
	}

	return summaries, nil
}

// makePiEventCallback returns an OnEvent callback that forwards pi stdout events
// to the desktop WebSocket connection.
func (h *JSONRPCHandler) makePiEventCallback(sessionID string) func(string, string, string, []byte) {
	return func(_ string, tabID string, workspaceID string, event []byte) {
		state, exists := h.piSessions.Get(sessionID)
		if !exists || state.Conn == nil {
			return
		}

		resolvedTabID := tabID
		resolvedWorkspaceID := workspaceID
		if strings.TrimSpace(state.TabID) != "" {
			resolvedTabID = state.TabID
		}
		if strings.TrimSpace(state.WorkspaceID) != "" {
			resolvedWorkspaceID = state.WorkspaceID
		}

		// Forward as a frontend event notification.
		_ = state.Conn.Notify(MethodFrontendEventsStream, map[string]any{
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
// process exits. It only fires for the exact process still registered: a newer
// process that took over the same session id (fast reopen) leaves the event
// unsent, and a clean pi.stop is ignored by the desktop because its event
// router is already unsubscribed by then. The stale registry entry is
// intentionally kept so the task-run fail-closed guard in handlePiStart can
// still detect a session that died before attach; pi.start overwrites it and
// pi.attach self-heals.
func (h *JSONRPCHandler) handlePiSessionExit(exited *process.Session) {
	state, exists := h.piSessions.Lookup(exited)
	if !exists {
		return
	}
	connState := state.Conn
	if connState == nil || !connState.IsOpen() {
		return
	}

	// Re-check ownership just before sending: a concurrent pi.attach may have
	// rebound the session to a different connection; never notify a stale one.
	current, stillExists := h.piSessions.Lookup(exited)
	if !stillExists || current.Conn != connState {
		return
	}

	_ = connState.Notify(MethodFrontendEventsStream, map[string]any{
		"topic": "agent.pi.event",
		"payload": map[string]any{
			"sessionId":   exited.ID(),
			"tabId":       state.TabID,
			"workspaceId": state.WorkspaceID,
			"event":       json.RawMessage(`{"type":"session_end"}`),
		},
	})
}
