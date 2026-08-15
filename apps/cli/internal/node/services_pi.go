package node

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
	terminalruntime "yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

// PiService implementation. Each method performs one pi session or provider
// operation; session state coordination lives in internal/agent/session (the
// registry owns the maps and mutexes).

func (s *Service) PiStart(ctx context.Context, connState *rpc.Connection, req rpc.PiStartParams) (any, error) {
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "sessionId is required")
	}
	if req.CWD == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "cwd is required")
	}

	// A fast reopen of the same session id can race an in-flight pi.stop for
	// that id (teardown holds the id for up to abortGracePeriod). Wait for the
	// teardown to finish so the reopen starts a fresh process instead of
	// reporting ErrSessionExists or attaching to a process being killed. The
	// wait runs again after ErrSessionExists below because the stop's marker
	// may be set after this first check.
	s.piSessions.WaitForStopping(ctx, s.deps.AgentMgr, req.SessionID)

	// A task-run session whose pi process exited before any client attached
	// leaves a stale registry entry (readStdout only unregisters the process
	// manager). Its prompt was already consumed by the dead process, so
	// spawning a fresh process under the same session id would produce a
	// silent idle tab that never ran the task. Fail closed instead.
	taskRunState, exists := s.piSessions.Get(req.SessionID)
	if exists && taskRunState.TaskRun {
		if _, alive := s.deps.AgentMgr.Session(req.SessionID); !alive {
			s.piSessions.Delete(req.SessionID)
			log.Warn().Str("sessionId", req.SessionID).Msg("pi.start: task run session ended before attach")
			return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "task run session ended before it could be attached: "+req.SessionID)
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
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
	}

	opts := process.StartOptions{
		SessionID:   req.SessionID,
		TabID:       req.TabID,
		WorkspaceID: req.WorkspaceID,
		Binary:      "pi",
		Args:        args,
		CWD:         req.CWD,
		ExtraEnv:    extraEnv,
		OnEvent:     s.makePiEventCallback(req.SessionID),
		OnExit:      s.handlePiSessionExit,
	}

	// Pi sessions are owned by the daemon, not the desktop WebSocket. A laptop
	// sleep can close the WebSocket temporarily; app.Close cancels the agent
	// lifecycle context and stops all sessions on daemon shutdown.
	if err := s.deps.AgentLifecycleCtx.Err(); err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, "daemon is shutting down")
	}
	proc, err := s.deps.AgentMgr.Start(s.deps.AgentLifecycleCtx, opts)
	if err != nil {
		if errors.Is(err, process.ErrSessionExists) {
			// The existing session may be mid-teardown (its pi.stop began after
			// our first wait above). Wait for the teardown to release the id,
			// then start a fresh process so a fast reopen works regardless of
			// RPC ordering.
			if s.piSessions.WaitForStopping(ctx, s.deps.AgentMgr, req.SessionID) {
				proc, err = s.deps.AgentMgr.Start(s.deps.AgentLifecycleCtx, opts)
			}
		}
		if err != nil {
			if errors.Is(err, process.ErrSessionExists) {
				return nil, workspace.NewRPCError(rpcerror.CodeSessionExists, err.Error())
			}
			return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
		}
	}

	s.piSessions.Register(req.SessionID, connState, proc, req.TabID, req.WorkspaceID, req.CWD, false)

	// A process that exited before the registry insert (instant crash) would
	// otherwise lose its session_end notification: its OnExit ran before the
	// entry existed. Fire the exit handler now that the entry is in place.
	if _, alive := s.deps.AgentMgr.Session(req.SessionID); !alive {
		s.handlePiSessionExit(proc)
	}

	return map[string]any{"sessionId": req.SessionID}, nil
}

func (s *Service) PiAttach(ctx context.Context, connState *rpc.Connection, req rpc.PiAttachParams) (any, error) {
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "sessionId is required")
	}

	// Never rebind to a session that is mid-teardown: the pi.stop that follows
	// would delete the registry entry under the newly attached tab.
	if s.piSessions.IsStopping(req.SessionID) {
		return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "pi session is stopping: "+req.SessionID)
	}

	// A concurrent pi.start for the same id (e.g. two tabs opening the same
	// history session at once) may still be spawning: the id is reserved in the
	// manager but the session is not registered yet. Wait for it so the second
	// opener attaches to the winning process instead of failing with
	// "pi session not found".
	if _, exists := s.deps.AgentMgr.Session(req.SessionID); !exists {
		if !s.piSessions.WaitForStart(ctx, s.deps.AgentMgr, req.SessionID) {
			s.piSessions.Delete(req.SessionID)
			return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "pi session not found: "+req.SessionID)
		}
	}

	// Re-check the stopping marker: a pi.stop may have started while we waited
	// for the concurrent start, and its teardown would delete the entry under a
	// newly attached tab.
	if s.piSessions.IsStopping(req.SessionID) {
		return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "pi session is stopping: "+req.SessionID)
	}

	if _, exists := s.piSessions.Attach(req.SessionID, connState, req.TabID, req.WorkspaceID, req.CWD); !exists {
		return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "pi session not found: "+req.SessionID)
	}

	return map[string]bool{"ok": true}, nil
}

func buildPiStartExtraEnv(req rpc.PiStartParams) ([]string, error) {
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

func (s *Service) PiStop(ctx context.Context, req rpc.PiStopParams) (any, error) {
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "sessionId is required")
	}

	// Mark the session as stopping before the (potentially slow) process
	// teardown so concurrent pi.start/pi.attach cannot bind to a dying process.
	if !s.piSessions.MarkStopping(req.SessionID) {
		// Nothing to stop; still report ok so the desktop can clean up.
		return map[string]bool{"ok": true}, nil
	}

	if err := s.deps.AgentMgr.Stop(req.SessionID); err != nil {
		s.piSessions.UnmarkStopping(req.SessionID)
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
	}

	s.piSessions.Delete(req.SessionID)
	return map[string]bool{"ok": true}, nil
}

func (s *Service) PiSend(ctx context.Context, req rpc.PiSendParams) (any, error) {
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "sessionId is required")
	}
	if len(req.Command) == 0 {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "command is required")
	}

	state, exists := s.piSessions.Get(req.SessionID)
	if !exists {
		return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "pi session not found: "+req.SessionID)
	}

	if err := state.Process.Send(req.Command); err != nil {
		// A dead process leaves the registry entry behind until the next
		// stop/attach; report it as not-found so clients recover by re-starting
		// instead of surfacing a raw pipe error.
		if errors.Is(err, process.ErrStdinClosed) {
			return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "pi session not found: "+req.SessionID)
		}
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
	}

	return map[string]bool{"ok": true}, nil
}

func (s *Service) PiListSessions(ctx context.Context, req rpc.PiListSessionsParams) (any, error) {
	if strings.TrimSpace(req.CWD) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "cwd is required")
	}

	summaries, err := process.ListSessionSummaries(ctx, req.CWD)
	if err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
	}

	return summaries, nil
}

func (s *Service) PiGetSessionFile(ctx context.Context, req rpc.PiGetSessionFileParams) (any, error) {
	if strings.TrimSpace(req.CWD) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "cwd is required")
	}
	if strings.TrimSpace(req.SessionID) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "sessionId is required")
	}

	filePath, err := process.FindSessionFile(ctx, req.CWD, req.SessionID)
	if err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
	}

	return map[string]string{"filePath": filePath}, nil
}

func (s *Service) PiRename(ctx context.Context, req rpc.PiRenameParams) (any, error) {
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "sessionId is required")
	}
	if req.Title == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "title is required")
	}

	state, exists := s.piSessions.Get(req.SessionID)
	if !exists {
		return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "pi session not found: "+req.SessionID)
	}

	renameCmd, err := json.Marshal(map[string]string{
		"type": "set_session_name",
		"name": req.Title,
	})
	if err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
	}

	if err := state.Process.Send(renameCmd); err != nil {
		// A dead process leaves the registry entry behind until the next
		// stop/attach; report it as not-found so clients recover by re-starting
		// instead of surfacing a raw pipe error.
		if errors.Is(err, process.ErrStdinClosed) {
			return nil, workspace.NewRPCError(rpcerror.CodeNotFound, "pi session not found: "+req.SessionID)
		}
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
	}

	return map[string]bool{"ok": true}, nil
}

func (s *Service) PiListActiveSessions(ctx context.Context) (any, error) {
	activeSessions := s.deps.AgentMgr.Sessions()
	if len(activeSessions) == 0 {
		return []rpc.PiActiveSessionSummary{}, nil
	}

	metadataBySessionID := s.piSessions.Snapshot()

	summaries := make([]rpc.PiActiveSessionSummary, 0, len(activeSessions))
	for _, proc := range activeSessions {
		metadata, exists := metadataBySessionID[proc.ID()]
		if !exists {
			continue
		}

		summaries = append(summaries, rpc.PiActiveSessionSummary{
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
func (s *Service) makePiEventCallback(sessionID string) func(string, string, string, []byte) {
	return func(_ string, tabID string, workspaceID string, event []byte) {
		state, exists := s.piSessions.Get(sessionID)
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
// intentionally kept so the task-run fail-closed guard in PiStart can still
// detect a session that died before attach; pi.start overwrites it and
// pi.attach self-heals.
func (s *Service) handlePiSessionExit(exited *process.Session) {
	state, exists := s.piSessions.Lookup(exited)
	if !exists {
		return
	}
	connState := state.Conn
	if connState == nil || !connState.IsOpen() {
		return
	}

	// Re-check ownership just before sending: a concurrent pi.attach may have
	// rebound the session to a different connection; never notify a stale one.
	current, stillExists := s.piSessions.Lookup(exited)
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
