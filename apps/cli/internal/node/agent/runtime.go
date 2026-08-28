package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/agent/session"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// AgentStart adapts the runtime-neutral start contract to the existing Pi
// lifecycle. DSH remains inspection-only during this phase.
func (s *Service) AgentStart(ctx context.Context, connection *rpc.Connection, req rpc.AgentStartParams) (any, error) {
	workspaceInstance, err := s.resolveAgentWorkspace(req.Runtime, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.SessionID) == "" || strings.TrimSpace(req.TabID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "sessionId and tabId are required")
	}
	if req.Runtime == rpc.AgentRuntimeDSH {
		if err := validateDSHTranscriptProtocol(req.TranscriptProtocolVersion); err != nil {
			return nil, err
		}
		return s.startDSH(ctx, connection, req)
	}
	_, err = s.Start(ctx, connection, rpc.PiStartParams{
		SessionID: req.SessionID, TabID: req.TabID, PaneID: req.PaneID, WorkspaceID: req.WorkspaceID, CWD: workspaceInstance.Path, Resume: req.Resume,
	})
	if err != nil {
		return nil, err
	}
	return rpc.AgentStartResult{Runtime: rpc.AgentRuntimePi, SessionID: req.SessionID}, nil
}

// AgentAttach attaches a connection after atomically checking ownership of the
// live Pi session. Waiting for a concurrent start preserves Pi's attach race.
func (s *Service) AgentAttach(ctx context.Context, connection *rpc.Connection, req rpc.AgentAttachParams) (any, error) {
	if req.Runtime == rpc.AgentRuntimeDSH && req.AfterSeqProvided && (req.AfterSeq < -1 || req.AfterSeq >= maxDSHAfterSeq) {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "afterSeq must be between -1 and MAX_SAFE_INTEGER - 1")
	}
	workspaceInstance, err := s.resolveAgentSessionWorkspace(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	if req.Runtime == rpc.AgentRuntimeDSH {
		if err := validateDSHTranscriptProtocol(req.TranscriptProtocolVersion); err != nil {
			return nil, err
		}
		return s.attachDSH(ctx, connection, req)
	}
	if err := s.waitForPiStart(ctx, req.SessionID); err != nil {
		return nil, err
	}
	if err := s.attachOwnedPiSession(connection, req, workspaceInstance.Path); err != nil {
		return nil, err
	}
	return rpc.AgentAckResult{Runtime: rpc.AgentRuntimePi, OK: true}, nil
}

// AgentPrompt encodes semantic prompt data into Pi's command wire format.
func (s *Service) AgentPrompt(ctx context.Context, req rpc.AgentPromptParams) (any, error) {
	if req.Runtime == rpc.AgentRuntimeDSH {
		return s.promptDSH(ctx, req)
	}
	admission, err := s.admitNeutralAgentWorkspace(req.SessionID, req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	defer s.piSessions.ReleaseAdmission(admission)
	workspaceInstance, err := s.resolveAgentSessionWorkspace(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	if len(req.Message) == 0 || !json.Valid(req.Message) {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "message must be valid JSON")
	}
	command, err := buildAgentPromptCommand(req.Runtime, req.Message, req.StreamingBehavior)
	if err != nil {
		return nil, err
	}
	owned, err := s.ownedLivePiProcess(req.SessionID, req.WorkspaceID, workspaceInstance.Path)
	if err != nil {
		return nil, err
	}
	if err := s.sendOwnedPiProcess(req.SessionID, owned.Process(), command); err != nil {
		return nil, err
	}
	return rpc.AgentAckResult{Runtime: rpc.AgentRuntimePi, OK: true}, nil
}

// AgentAbort interrupts the current Pi turn while leaving its session live.
func (s *Service) AgentAbort(ctx context.Context, req rpc.AgentAbortParams) (any, error) {
	if req.Runtime == rpc.AgentRuntimeDSH {
		return s.abortDSH(ctx, req)
	}
	admission, err := s.admitNeutralAgentWorkspace(req.SessionID, req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	defer s.piSessions.ReleaseAdmission(admission)
	workspaceInstance, err := s.resolveAgentSessionWorkspace(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	owned, err := s.ownedLivePiProcess(req.SessionID, req.WorkspaceID, workspaceInstance.Path)
	if err != nil {
		return nil, err
	}
	if err := s.sendOwnedPiProcess(req.SessionID, owned.Process(), json.RawMessage(`{"type":"abort"}`)); err != nil {
		return nil, err
	}
	return rpc.AgentAckResult{Runtime: rpc.AgentRuntimePi, OK: true}, nil
}

// AgentSetModel switches the model for the next turn of a live DSH session.
func (s *Service) AgentSetModel(ctx context.Context, req rpc.AgentSetModelParams) (any, error) {
	if s.deps.DSH == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh runtime unavailable")
	}
	workspaceInstance, err := s.resolveAgentSessionWorkspace(rpc.AgentRuntimeDSH, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	selection := dshAgentOptionsFrom(req.ModelID, req.Provider, s.deps.DSHModel)
	if err := s.deps.DSH.SetModelSession(ctx, dsh.SetModelRequest{
		CWD:       workspaceInstance.Path,
		SessionID: req.SessionID,
		Model:     selection.Model,
		Provider:  selection.Provider,
	}); err != nil {
		return nil, mapDSHExecutionError(err)
	}
	s.dshSessions.setSelection(req.SessionID, req.WorkspaceID, workspaceInstance.Path, selection.Provider, selection.Model)
	return rpc.AgentAckResult{Runtime: rpc.AgentRuntimeDSH, OK: true}, nil
}

// AgentDispose releases a Pi session and its runtime resources.
func (s *Service) AgentDispose(ctx context.Context, req rpc.AgentDisposeParams) (any, error) {
	if req.Runtime == rpc.AgentRuntimeDSH {
		return s.disposeDSH(ctx, req)
	}
	workspaceInstance, err := s.resolveAgentSessionWorkspace(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	claim, err := s.ownedPiStopClaim(req.SessionID, req.WorkspaceID, workspaceInstance.Path)
	if err != nil {
		return nil, err
	}
	if err := s.stopClaim(ctx, claim); err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	return rpc.AgentAckResult{Runtime: rpc.AgentRuntimePi, OK: true}, nil
}

// AgentListSessions lists persisted runtime sessions without starting DSH.
func (s *Service) AgentListSessions(ctx context.Context, req rpc.AgentListSessionsParams) (any, error) {
	workspaceInstance, err := s.resolveAgentWorkspace(req.Runtime, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	if req.Runtime == rpc.AgentRuntimeDSH {
		listed, err := s.ListDSHSessions(ctx, req.WorkspaceID)
		if err != nil {
			return nil, mapDSHExecutionError(err)
		}
		return rpc.AgentSessionsResult{Runtime: req.Runtime, Sessions: mapDSHSessions(listed.Sessions, workspaceInstance.Path)}, nil
	}
	sessions, err := s.ListSessions(ctx, rpc.PiListSessionsParams{CWD: workspaceInstance.Path})
	if err != nil {
		return nil, err
	}
	piSessions, ok := sessions.([]process.SessionSummary)
	if !ok {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "unexpected Pi session list result")
	}
	return rpc.AgentSessionsResult{Runtime: req.Runtime, Sessions: mapPiSessions(piSessions, workspaceInstance.Path)}, nil
}

// AgentListSessionLineage lists DSH-native subagents below an open workspace session.
func (s *Service) AgentListSessionLineage(ctx context.Context, req rpc.AgentListSessionLineageParams) (any, error) {
	if err := validateAgentSessionLineageRequest(req); err != nil {
		return nil, err
	}
	workspaceInstance, err := s.resolveAgentWorkspace(req.Runtime, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	lineage, err := s.listDSHSessionLineage(ctx, workspaceInstance.Path, req.RootSessionID, req.Mode)
	if err != nil {
		return nil, mapDSHExecutionError(err)
	}
	return mapDSHSessionLineage(lineage), nil
}

// AgentReadHistory reads durable runtime history without resuming DSH.
func (s *Service) AgentReadHistory(ctx context.Context, req rpc.AgentReadHistoryParams) (any, error) {
	workspaceInstance, err := s.resolveAgentSessionWorkspace(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	if req.Runtime == rpc.AgentRuntimeDSH {
		if err := validateDSHTranscriptProtocol(req.TranscriptProtocolVersion); err != nil {
			return nil, err
		}
		history, err := s.ReadDSHSession(ctx, req.WorkspaceID, req.SessionID)
		if err != nil {
			return nil, mapDSHExecutionError(err)
		}
		projectedEvents, err := projectDSHHistoryEvents(history.Events)
		if err != nil {
			return nil, mapDSHTranscriptProtocolError(err)
		}
		return rpc.AgentHistoryResult{Runtime: req.Runtime, DSH: &rpc.AgentDSHHistory{
			Session: rpc.AgentDSHSessionMetadata{SessionID: history.Session.SessionID, CreatedAt: history.Session.CreatedAt, ParentSession: history.Session.ParentSession, AgentPreset: history.Session.AgentPreset},
			Events:  projectedEvents, Incarnation: history.Incarnation, AsOfSeq: history.AsOfSeq,
			DurableThroughSeq: history.DurableThroughSeq,
		}}, nil
	}
	history, err := s.GetSessionFile(ctx, rpc.PiGetSessionFileParams{CWD: workspaceInstance.Path, SessionID: req.SessionID})
	if err != nil {
		return nil, err
	}
	fileResult, ok := history.(map[string]string)
	if !ok {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "unexpected Pi history result")
	}
	return rpc.AgentHistoryResult{Runtime: req.Runtime, Pi: &rpc.AgentPiHistory{FilePath: fileResult["filePath"]}}, nil
}

func (s *Service) admitNeutralAgentWorkspace(sessionID, workspaceID string) (*session.Admission, error) {
	admission, err := s.piSessions.Admit(workspaceID)
	if err != nil {
		return nil, ownedPiSessionNotFound(sessionID)
	}
	return admission, nil
}

func (s *Service) resolveAgentWorkspace(runtime rpc.AgentRuntime, workspaceID string, cwd string) (workspace.Workspace, error) {
	if err := validateAgentWorkspaceRequest(runtime, workspaceID, cwd); err != nil {
		return workspace.Workspace{}, err
	}
	if s.deps.Workspace == nil {
		return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeServerError, "workspace resolver is unavailable")
	}
	workspaceInstance, err := s.deps.Workspace.GetWorkspace(workspaceID)
	if err != nil {
		return workspace.Workspace{}, err
	}
	if cwd != workspaceInstance.Path {
		return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeInvalidParams, "cwd does not match workspace path")
	}
	return workspaceInstance, nil
}

func (s *Service) resolveAgentSessionWorkspace(runtime rpc.AgentRuntime, sessionID, workspaceID, cwd string) (workspace.Workspace, error) {
	if strings.TrimSpace(sessionID) == "" {
		return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeInvalidParams, "sessionId is required")
	}
	return s.resolveAgentWorkspace(runtime, workspaceID, cwd)
}

func (s *Service) ownedLivePiProcess(sessionID, workspaceID, cwd string) (*session.OwnedProcess, error) {
	if s.deps.AgentMgr == nil {
		return nil, ownedPiSessionNotFound(sessionID)
	}
	owned, err := s.piSessions.GetLiveOwnedProcess(s.deps.AgentMgr, sessionID, workspaceID, cwd)
	if err != nil {
		return nil, ownedPiSessionNotFound(sessionID)
	}
	return owned, nil
}

func (s *Service) ownedPiStopClaim(sessionID, workspaceID, cwd string) (*session.StopClaim, error) {
	if s.deps.AgentMgr == nil {
		return nil, ownedPiSessionNotFound(sessionID)
	}
	claim, err := s.piSessions.ClaimOwnedStop(s.deps.AgentMgr, sessionID, workspaceID, cwd)
	if err != nil {
		return nil, ownedPiSessionNotFound(sessionID)
	}
	return claim, nil
}

func ownedPiSessionNotFound(sessionID string) error {
	return rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+sessionID)
}

func (s *Service) sendOwnedPiProcess(sessionID string, proc *process.Session, command json.RawMessage) error {
	if s.afterOwnedProcess != nil {
		s.afterOwnedProcess()
	}
	if err := proc.Send(command); err != nil {
		if errors.Is(err, process.ErrStdinClosed) {
			return ownedPiSessionNotFound(sessionID)
		}
		return rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	return nil
}

func (s *Service) attachOwnedPiSession(connection *rpc.Connection, req rpc.AgentAttachParams, cwd string) error {
	if s.deps.AgentMgr == nil {
		return rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+req.SessionID)
	}
	attached, err := s.piSessions.AttachLiveOwned(s.deps.AgentMgr, req.SessionID, connection, req.TabID, req.WorkspaceID, cwd)
	if err == nil && attached != nil {
		return nil
	}
	if err == nil || err == session.ErrWorkspaceMismatch || err == session.ErrSessionNotLive || err == session.ErrSessionStopping || err == session.ErrWorkspaceClosing {
		return rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+req.SessionID)
	}
	return rpc.NewRPCError(rpc.CodeServerError, err.Error())
}

func buildAgentPromptCommand(runtime rpc.AgentRuntime, message json.RawMessage, streamingBehavior string) (json.RawMessage, error) {
	command := struct {
		Type              string          `json:"type"`
		Message           json.RawMessage `json:"message"`
		StreamingBehavior string          `json:"streamingBehavior,omitempty"`
	}{Type: "prompt", Message: message}
	if runtime == rpc.AgentRuntimePi {
		command.StreamingBehavior = streamingBehavior
	}
	encoded, err := json.Marshal(command)
	if err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	return encoded, nil
}

func mapPiSessions(summaries []process.SessionSummary, cwd string) []rpc.AgentSessionSummary {
	mapped := make([]rpc.AgentSessionSummary, 0, len(summaries))
	for _, summary := range summaries {
		createdAt := int64(0)
		if !summary.Timestamp.IsZero() {
			createdAt = summary.Timestamp.UnixMilli()
		}
		mapped = append(mapped, rpc.AgentSessionSummary{SessionID: summary.SessionID, CWD: cwd, CreatedAt: createdAt, Model: summary.Model, PreviewText: summary.PreviewText, SessionName: summary.SessionName, Persisted: true})
	}
	return mapped
}

func mapDSHSessions(summaries []dsh.SessionListEntry, cwd string) []rpc.AgentSessionSummary {
	mapped := make([]rpc.AgentSessionSummary, 0, len(summaries))
	for _, summary := range summaries {
		mapped = append(mapped, rpc.AgentSessionSummary{SessionID: summary.SessionID, CWD: cwd, CreatedAt: summary.CreatedAt, ParentSession: summary.ParentSession, AgentPreset: summary.AgentPreset, Live: summary.Live, Persisted: summary.Persisted})
	}
	return mapped
}

func validateAgentSessionLineageRequest(req rpc.AgentListSessionLineageParams) error {
	if req.Runtime != rpc.AgentRuntimeDSH {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "runtime must be dsh")
	}
	if strings.TrimSpace(req.RootSessionID) == "" {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "rootSessionId is required")
	}
	if req.Mode != rpc.AgentSessionLineageChildren && req.Mode != rpc.AgentSessionLineageDescendants {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "mode must be children or descendants")
	}
	return nil
}

func validateAgentWorkspaceRequest(runtime rpc.AgentRuntime, workspaceID string, cwd string) error {
	if err := validateAgentRuntime(runtime); err != nil {
		return err
	}
	if strings.TrimSpace(workspaceID) == "" {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "workspaceId is required")
	}
	if strings.TrimSpace(cwd) == "" {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "cwd is required")
	}
	return nil
}

func validateAgentRuntime(runtime rpc.AgentRuntime) error {
	if runtime != rpc.AgentRuntimePi && runtime != rpc.AgentRuntimeDSH {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "runtime must be pi or dsh")
	}
	return nil
}

func validateDSHTranscriptProtocol(version int) error {
	if version != rpc.DSHTranscriptProtocolVersion {
		return mapDSHTranscriptProtocolError(errDSHTranscriptProtocolUnavailable)
	}
	return nil
}

func mapDSHTranscriptProtocolError(error) error {
	return rpc.NewRPCErrorWithData(rpc.CodeServerError, "dsh transcript protocol unavailable", map[string]any{
		"code": rpc.ErrorDataCodeDSHTranscriptProtocolUnavailable,
	})
}
