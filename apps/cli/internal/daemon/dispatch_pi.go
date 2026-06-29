package daemon

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/agentmanager"
	"yishan/apps/cli/internal/workspace"
)

// piSessionState tracks the desktop connection that owns a pi session.
type piSessionState struct {
	connState *wsConnState
	session   *agentmanager.Session
}

func (h *JSONRPCHandler) dispatchPi(ctx context.Context, connState *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodPiStart:
		return h.handlePiStart(ctx, connState, params)
	case MethodPiStop:
		return h.handlePiStop(params)
	case MethodPiSend:
		return h.handlePiSend(params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown pi method: "+method)
	}
}

type piStartParams struct {
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId"`
	WorkspaceID string `json:"workspaceId"`
	CWD         string `json:"cwd"`
}

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

	opts := agentmanager.StartOptions{
		SessionID:   req.SessionID,
		TabID:       req.TabID,
		WorkspaceID: req.WorkspaceID,
		Binary:      "pi",
		Args:        []string{"--mode", "rpc", "--name", req.TabID},
		CWD:         req.CWD,
		OnEvent:     h.makePiEventCallback(req.SessionID),
	}

	session, err := h.agentMgr.Start(ctx, opts)
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	h.piSessionsMu.Lock()
	h.piSessions[req.SessionID] = &piSessionState{connState: connState, session: session}
	h.piSessionsMu.Unlock()

	// When the desktop connection closes, stop the pi session.
	connState.AddCloseHook(func() {
		h.agentMgr.Stop(req.SessionID)
		h.piSessionsMu.Lock()
		delete(h.piSessions, req.SessionID)
		h.piSessionsMu.Unlock()
	})

	return map[string]any{"sessionId": req.SessionID}, nil
}

type piStopParams struct {
	SessionID string `json:"sessionId"`
}

func (h *JSONRPCHandler) handlePiStop(params json.RawMessage) (any, error) {
	var req piStopParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}

	if err := h.agentMgr.Stop(req.SessionID); err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	h.piSessionsMu.Lock()
	delete(h.piSessions, req.SessionID)
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
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}

	return map[string]bool{"ok": true}, nil
}

// makePiEventCallback returns an OnEvent callback that forwards pi stdout events
// to the desktop WebSocket connection.
func (h *JSONRPCHandler) makePiEventCallback(sessionID string) func(string, string, string, []byte) {
	return func(_ string, tabID string, workspaceID string, event []byte) {
		h.piSessionsMu.Lock()
		state, exists := h.piSessions[sessionID]
		h.piSessionsMu.Unlock()

		if !exists {
			return
		}

		// Forward as a frontend event notification.
		_ = state.connState.Notify(MethodFrontendEventsStream, map[string]any{
			"topic": "agent.pi.event",
			"payload": map[string]any{
				"sessionId":   sessionID,
				"tabId":       tabID,
				"workspaceId": workspaceID,
				"event":       json.RawMessage(event),
			},
		})
	}
}
