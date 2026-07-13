package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/agentmanager"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/workspace"
	terminalruntime "yishan/apps/cli/internal/workspace/terminal"
)

// piSessionState tracks the desktop connection and recovery metadata for one live pi session.
type piSessionState struct {
	connState   *wsConnState
	session     *agentmanager.Session
	tabID       string
	workspaceID string
	cwd         string
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
		return h.handlePiAttach(connState, params)
	case MethodPiStop:
		return h.handlePiStop(params)
	case MethodPiSend:
		return h.handlePiSend(params)
	case MethodPiListSessions:
		return h.handlePiListSessions(ctx, params)
	case MethodPiListActiveSessions:
		return h.handlePiListActiveSessions()
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

	args := []string{"--mode", "rpc", "--name", req.TabID}
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
	}

	session, err := h.agentMgr.Start(ctx, opts)
	if err != nil {
		if errors.Is(err, agentmanager.ErrSessionExists) {
			return nil, workspace.NewRPCError(rpcCodeSessionExists, err.Error())
		}
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
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

	return map[string]any{"sessionId": req.SessionID}, nil
}

type piAttachParams struct {
	SessionID   string `json:"sessionId"`
	TabID       string `json:"tabId,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	CWD         string `json:"cwd,omitempty"`
}

func (h *JSONRPCHandler) handlePiAttach(connState *wsConnState, params json.RawMessage) (any, error) {
	var req piAttachParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if req.SessionID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "sessionId is required")
	}
	if _, exists := h.agentMgr.Session(req.SessionID); !exists {
		h.piSessionsMu.Lock()
		delete(h.piSessions, req.SessionID)
		h.piSessionsMu.Unlock()
		return nil, workspace.NewRPCError(rpcCodeNotFound, "pi session not found: "+req.SessionID)
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
