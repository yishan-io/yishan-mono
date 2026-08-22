package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/rpc"
)

// PiService implementation. Each method performs one pi session or provider
// operation; session state coordination lives in internal/agent/session (the
// registry owns the maps and mutexes).

func (s *Service) Send(ctx context.Context, req rpc.PiSendParams) (any, error) {
	if req.SessionID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "sessionId is required")
	}
	if len(req.Command) == 0 {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "command is required")
	}

	state, exists := s.piSessions.Get(req.SessionID)
	if !exists {
		return nil, rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+req.SessionID)
	}

	if err := state.Process.Send(req.Command); err != nil {
		// A dead process leaves the registry entry behind until the next
		// stop/attach; report it as not-found so clients recover by re-starting
		// instead of surfacing a raw pipe error.
		if errors.Is(err, process.ErrStdinClosed) {
			return nil, rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+req.SessionID)
		}
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}

	return map[string]bool{"ok": true}, nil
}

func (s *Service) ListSessions(ctx context.Context, req rpc.PiListSessionsParams) (any, error) {
	if strings.TrimSpace(req.CWD) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "cwd is required")
	}

	summaries, err := process.ListSessionSummaries(ctx, req.CWD)
	if err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}

	return summaries, nil
}

func (s *Service) GetSessionFile(ctx context.Context, req rpc.PiGetSessionFileParams) (any, error) {
	if strings.TrimSpace(req.CWD) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "cwd is required")
	}
	if strings.TrimSpace(req.SessionID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "sessionId is required")
	}

	filePath, err := process.FindSessionFile(ctx, req.CWD, req.SessionID)
	if err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}

	return map[string]string{"filePath": filePath}, nil
}

func (s *Service) Rename(ctx context.Context, req rpc.PiRenameParams) (any, error) {
	if req.SessionID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "sessionId is required")
	}
	if req.Title == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "title is required")
	}

	state, exists := s.piSessions.Get(req.SessionID)
	if !exists {
		return nil, rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+req.SessionID)
	}

	renameCmd, err := json.Marshal(map[string]string{
		"type": "set_session_name",
		"name": req.Title,
	})
	if err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}

	if err := state.Process.Send(renameCmd); err != nil {
		// A dead process leaves the registry entry behind until the next
		// stop/attach; report it as not-found so clients recover by re-starting
		// instead of surfacing a raw pipe error.
		if errors.Is(err, process.ErrStdinClosed) {
			return nil, rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+req.SessionID)
		}
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}

	return map[string]bool{"ok": true}, nil
}

func (s *Service) ListActiveSessions(ctx context.Context) (any, error) {
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
		_ = state.Conn.Notify(rpc.MethodFrontendEventsStream, map[string]any{
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

	_ = connState.Notify(rpc.MethodFrontendEventsStream, map[string]any{
		"topic": "agent.pi.event",
		"payload": map[string]any{
			"sessionId":   exited.ID(),
			"tabId":       state.TabID,
			"workspaceId": state.WorkspaceID,
			"event":       json.RawMessage(`{"type":"session_end"}`),
		},
	})
}
