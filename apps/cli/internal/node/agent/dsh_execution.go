package agent

import (
	"context"
	"encoding/json"
	"errors"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/agent/session"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

const (
	dshEventTopic  = "agent.dsh.event"
	maxDSHAfterSeq = int64(9_007_199_254_740_991)
)

type dshFrontendEvent struct {
	SessionID   string            `json:"sessionId"`
	TabID       string            `json:"tabId"`
	WorkspaceID string            `json:"workspaceId"`
	Incarnation string            `json:"incarnation"`
	Update      dsh.SessionUpdate `json:"update"`
}

func (s *Service) AgentGetCapabilities(context.Context) (any, error) {
	result := rpc.AgentCapabilitiesResult{}
	result.DSH.TranscriptProtocolVersion = rpc.DSHTranscriptProtocolVersion
	if s.deps.DSH == nil {
		return result, nil
	}
	health := s.deps.DSH.Health()
	result.DSH.Configured, result.DSH.Ready = true, health.IsReady
	if health.IsReady {
		result.DSH.Incarnation = health.Incarnation
	}
	return result, nil
}

func (s *Service) startDSH(ctx context.Context, connection *rpc.Connection, req rpc.AgentStartParams) (any, error) {
	admission, err := s.piSessions.Admit(req.WorkspaceID)
	if err != nil {
		return nil, workspaceClosingError(req.WorkspaceID)
	}
	defer s.piSessions.ReleaseAdmission(admission)
	workspaceInstance, err := s.resolveAgentWorkspace(req.Runtime, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	return s.startDSHSession(ctx, connection, req, workspaceInstance)
}

func (s *Service) startDSHSession(ctx context.Context, connection *rpc.Connection, req rpc.AgentStartParams, workspaceInstance workspace.Workspace) (any, error) {
	cwd := workspaceInstance.Path
	claim, err := s.runtimeIdentities.acquireDSHStart(req.SessionID)
	if err != nil {
		return nil, err
	}
	startCompleted := false
	defer func() {
		if !startCompleted {
			s.runtimeIdentities.completeStart(req.SessionID, rpc.AgentRuntimeDSH, claim, false, claim.isQuarantined)
		}
	}()
	if s.deps.DSH == nil {
		return nil, mapDSHExecutionError(dsh.ErrRuntimeUnavailable)
	}
	if req.Resume {
		if _, err := s.dshRuntime().ResumeSession(ctx, dsh.SessionReadRequest{SessionID: req.SessionID, CWD: cwd}); err != nil {
			return nil, mapDSHExecutionError(err)
		}
	} else if _, err := s.dshRuntime().StartSession(ctx, dsh.SessionStartRequest{SessionID: req.SessionID, CWD: cwd, Binding: dsh.SessionBinding{Version: 1, WorkspaceID: workspaceInstance.ID, ProjectID: workspaceInstance.ProjectID, OrganizationID: workspaceInstance.OrgID, OwnerNodeID: s.deps.OwnerNodeID, CWD: cwd}}); err != nil {
		return nil, mapDSHExecutionError(err)
	}
	subscription, err := s.dshRuntime().SubscribeSession(ctx, dsh.SessionSubscribeRequest{SessionID: req.SessionID, CWD: cwd, AfterSeq: -1})
	if err != nil {
		cleanupErr, isDisposed := s.cleanupFailedDSHStart(ctx, req.SessionID, cwd, err)
		s.runtimeIdentities.completeStart(req.SessionID, rpc.AgentRuntimeDSH, claim, false, !isDisposed)
		startCompleted = true
		return nil, cleanupErr
	}
	result, err := s.registerStartedDSHSession(connection, req, cwd, claim, subscription)
	startCompleted = true
	return result, err
}

func (s *Service) registerStartedDSHSession(connection *rpc.Connection, req rpc.AgentStartParams, cwd string, claim runtimeIdentityClaim, subscription dsh.SessionSubscription) (any, error) {
	entry := &dshLiveSession{sessionID: req.SessionID, tabID: req.TabID, workspaceID: req.WorkspaceID, cwd: cwd, incarnation: subscription.Incarnation, connection: connection, available: true, subscription: subscription}
	if !s.dshSessions.register(entry) {
		subscription.Unsubscribe()
		// The registry winner owns this external session. Never compensate-dispose it.
		s.runtimeIdentities.completeStart(req.SessionID, rpc.AgentRuntimeDSH, claim, false, true)
		return nil, dshSessionConflict(req.SessionID)
	}
	s.runtimeIdentities.completeStart(req.SessionID, rpc.AgentRuntimeDSH, claim, true, false)
	s.bindDSHConnection(entry, connection)
	s.pumpDSHSubscription(entry)
	return rpc.AgentStartResult{Runtime: rpc.AgentRuntimeDSH, SessionID: req.SessionID}, nil
}

func (s *Service) attachDSH(ctx context.Context, connection *rpc.Connection, req rpc.AgentAttachParams) (any, error) {
	admission, err := s.piSessions.Admit(req.WorkspaceID)
	if err != nil {
		return nil, workspaceClosingError(req.WorkspaceID)
	}
	defer s.piSessions.ReleaseAdmission(admission)
	workspaceInstance, err := s.resolveAgentSessionWorkspace(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	entry, found := s.dshSessions.getOwned(req.SessionID, req.WorkspaceID, workspaceInstance.Path)
	if !found {
		return nil, dshSessionNotFound(req.SessionID)
	}
	return s.attachDSHSession(ctx, connection, req, entry)
}

func (s *Service) attachDSHSession(ctx context.Context, connection *rpc.Connection, req rpc.AgentAttachParams, entry *dshLiveSession) (any, error) {
	if s.deps.DSH == nil {
		return nil, mapDSHExecutionError(dsh.ErrRuntimeUnavailable)
	}
	if s.dshSessions.requiresResume(entry) {
		if _, err := s.dshRuntime().ResumeSession(ctx, dsh.SessionReadRequest{SessionID: req.SessionID, CWD: entry.cwd}); err != nil {
			return nil, mapDSHExecutionError(err)
		}
	}
	afterSeq := req.AfterSeq
	if !req.AfterSeqProvided && afterSeq == 0 {
		afterSeq = -1
	}
	subscription, err := s.dshRuntime().SubscribeSession(ctx, dsh.SessionSubscribeRequest{SessionID: req.SessionID, CWD: entry.cwd, AfterSeq: afterSeq})
	if err != nil {
		return nil, mapDSHExecutionError(err)
	}
	return s.rebindDSHSession(connection, req.SessionID, entry, subscription)
}

func (s *Service) rebindDSHSession(connection *rpc.Connection, sessionID string, entry *dshLiveSession, subscription dsh.SessionSubscription) (any, error) {
	generation, incarnationChanged, rebound := s.dshSessions.rebind(entry, connection, subscription)
	if !rebound {
		subscription.Unsubscribe()
		return nil, dshSessionNotFound(sessionID)
	}
	s.bindDSHConnectionGeneration(entry, connection, generation)
	if incarnationChanged {
		if route, found := s.dshSessions.route(entry, generation); found {
			if err := s.publishDSHUpdate(route, dsh.SessionUpdate{Reset: &dsh.TranscriptReset{SessionID: route.sessionID, Incarnation: subscription.Incarnation, HeadSeq: subscription.Baseline}}); err != nil {
				s.dshSessions.detach(entry, route.generation, route.connection)
				return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh frontend notification failed")
			}
		}
	}
	s.pumpDSHSubscription(entry)
	result, err := mapDSHAttachResult(subscription)
	if err != nil {
		subscription.Unsubscribe()
		return nil, mapDSHTranscriptProtocolError(err)
	}
	return result, nil
}

func mapDSHAttachResult(subscription dsh.SessionSubscription) (rpc.AgentDSHAttachResult, error) {
	snapshot := subscription.Snapshot
	events, err := projectDSHEvents(snapshot.Events)
	if err != nil {
		return rpc.AgentDSHAttachResult{}, err
	}
	return rpc.AgentDSHAttachResult{
		Runtime: rpc.AgentRuntimeDSH, SessionID: snapshot.SessionID, Incarnation: snapshot.Incarnation,
		Events: events, AsOfSeq: snapshot.AsOfSeq, DurableThroughSeq: snapshot.DurableThroughSeq, HeadSeq: snapshot.HeadSeq,
	}, nil
}

func (s *Service) promptDSH(ctx context.Context, req rpc.AgentPromptParams) (any, error) {
	entry, admission, err := s.ownedDSHEntry(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	defer s.piSessions.ReleaseAdmission(admission)
	if s.deps.DSH == nil {
		return nil, mapDSHExecutionError(dsh.ErrRuntimeUnavailable)
	}
	var text string
	if len(req.Message) == 0 || json.Unmarshal(req.Message, &text) != nil {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "message must be a JSON string")
	}
	_, err = s.dshRuntime().PromptSession(ctx, dsh.SessionPromptRequest{SessionID: entry.sessionID, CWD: entry.cwd, ContentBlocks: []dsh.TextPromptContentBlock{{Type: "text", Text: text}}})
	if err != nil {
		return nil, mapDSHExecutionError(err)
	}
	return rpc.AgentAckResult{Runtime: rpc.AgentRuntimeDSH, OK: true}, nil
}

func (s *Service) abortDSH(ctx context.Context, req rpc.AgentAbortParams) (any, error) {
	entry, admission, err := s.ownedDSHEntry(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	defer s.piSessions.ReleaseAdmission(admission)
	if s.deps.DSH == nil {
		return nil, mapDSHExecutionError(dsh.ErrRuntimeUnavailable)
	}
	_, err = s.dshRuntime().CancelSession(ctx, dsh.SessionCancelRequest{SessionID: entry.sessionID, CWD: entry.cwd})
	if err != nil {
		return nil, mapDSHExecutionError(err)
	}
	return rpc.AgentAckResult{Runtime: rpc.AgentRuntimeDSH, OK: true}, nil
}

func (s *Service) disposeDSH(ctx context.Context, req rpc.AgentDisposeParams) (any, error) {
	entry, admission, err := s.ownedDSHEntry(req.Runtime, req.SessionID, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	defer s.piSessions.ReleaseAdmission(admission)
	if s.deps.DSH == nil {
		return nil, mapDSHExecutionError(dsh.ErrRuntimeUnavailable)
	}
	disposed, err := s.dshRuntime().DisposeSession(ctx, dsh.SessionReadRequest{SessionID: entry.sessionID, CWD: entry.cwd})
	if err != nil {
		return nil, mapDSHExecutionError(err)
	}
	if !disposed.Disposed || !s.dshSessions.remove(entry) {
		return nil, dshSessionNotFound(req.SessionID)
	}
	s.runtimeIdentities.release(entry.sessionID, rpc.AgentRuntimeDSH)
	return rpc.AgentAckResult{Runtime: rpc.AgentRuntimeDSH, OK: true}, nil
}

func (s *Service) ownedDSHEntry(runtime rpc.AgentRuntime, sessionID, workspaceID, cwd string) (*dshLiveSession, *session.Admission, error) {
	admission, err := s.admitNeutralAgentWorkspace(sessionID, workspaceID)
	if err != nil {
		return nil, nil, err
	}
	workspaceInstance, err := s.resolveAgentSessionWorkspace(runtime, sessionID, workspaceID, cwd)
	if err != nil {
		s.piSessions.ReleaseAdmission(admission)
		return nil, nil, err
	}
	entry, found := s.dshSessions.getOwned(sessionID, workspaceID, workspaceInstance.Path)
	if !found {
		s.piSessions.ReleaseAdmission(admission)
		return nil, nil, dshSessionNotFound(sessionID)
	}
	return entry, admission, nil
}

func (s *Service) dshRuntime() DSHSessions { return s.deps.DSH }

func (s *Service) cleanupFailedDSHStart(ctx context.Context, sessionID string, cwd string, startErr error) (error, bool) {
	disposed, disposeErr := s.dshRuntime().DisposeSession(ctx, dsh.SessionReadRequest{SessionID: sessionID, CWD: cwd})
	if disposeErr == nil && disposed.Disposed {
		var rpcErr *rpc.Error
		if errors.As(startErr, &rpcErr) {
			return startErr, true
		}
		return mapDSHExecutionError(startErr), true
	}
	if disposeErr == nil {
		disposeErr = errors.New("DSH session was not disposed during start compensation")
	}
	return errors.Join(mapDSHExecutionError(startErr), mapDSHExecutionError(disposeErr)), false
}

func (s *Service) bindDSHConnection(entry *dshLiveSession, connection *rpc.Connection) {
	generation, _, found := s.dshSessions.binding(entry)
	if found {
		s.bindDSHConnectionGeneration(entry, connection, generation)
	}
}

func (s *Service) bindDSHConnectionGeneration(entry *dshLiveSession, connection *rpc.Connection, generation uint64) {
	if connection == nil {
		return
	}
	connection.AddCloseHook(func() { s.dshSessions.detach(entry, generation, connection) })
}

func (s *Service) pumpDSHSubscription(entry *dshLiveSession) {
	generation, updates, found := s.dshSessions.binding(entry)
	if !found {
		return
	}
	go s.forwardDSHUpdates(entry, generation, updates)
}

func (s *Service) forwardDSHUpdates(entry *dshLiveSession, generation uint64, updates <-chan dsh.SessionUpdate) {
	for update := range updates {
		var route dshRoute
		var found bool
		if update.Reset != nil {
			route, found = s.dshSessions.resetRoute(entry, generation, update.Reset.Incarnation)
		} else {
			route, found = s.dshSessions.route(entry, generation)
		}
		if !found || !route.connection.IsOpen() {
			continue
		}
		if err := s.publishDSHUpdate(route, update); err != nil {
			s.dshSessions.detach(entry, route.generation, route.connection)
			return
		}
	}
	s.dshSessions.markUnavailable(entry, generation)
}

func (s *Service) publishDSHUpdate(route dshRoute, update dsh.SessionUpdate) error {
	if update.Event != nil {
		projected, err := projectDSHUpdate(update)
		if err != nil {
			return err
		}
		update = projected
	}
	return s.notifyDSHUpdate(route, update)
}

func (s *Service) notifyDSHUpdate(route dshRoute, update dsh.SessionUpdate) error {
	if s.publishDSHUpdateError != nil {
		return s.publishDSHUpdateError
	}
	payload := dshFrontendEvent{SessionID: route.sessionID, TabID: route.tabID, WorkspaceID: route.workspaceID, Incarnation: route.incarnation, Update: update}
	return route.connection.Notify(rpc.MethodFrontendEventsStream, map[string]any{"topic": dshEventTopic, "payload": payload})
}

func dshSessionNotFound(sessionID string) error {
	return rpc.NewRPCError(rpc.CodeNotFound, "dsh session not found: "+sessionID)
}
func dshSessionConflict(sessionID string) error {
	return rpc.NewRPCError(rpc.CodeSessionExists, "dsh session already exists: "+sessionID)
}

func mapDSHExecutionError(err error) error {
	if errors.Is(err, context.Canceled) {
		return err
	}
	if errors.Is(err, dsh.ErrRuntimeUnavailable) || errors.Is(err, dsh.ErrRequestInterrupted) || errors.Is(err, dsh.ErrSessionReplayReset) {
		return rpc.NewRPCErrorWithData(rpc.CodeServerError, "dsh runtime unavailable", map[string]any{
			"code": rpc.ErrorDataCodeDSHRuntimeUnavailable,
		})
	}
	var requestErr *dsh.RequestError
	if errors.As(err, &requestErr) {
		switch dshRequestErrorCode(requestErr.Data) {
		case "YISHAN_SESSION_COLLISION", "YISHAN_SESSION_DISPOSING", "YISHAN_SESSION_BINDING_CONFLICT":
			return rpc.NewRPCError(rpc.CodeSessionExists, "dsh session conflict")
		case "YISHAN_SESSION_WORKSPACE_MISMATCH", "YISHAN_SESSION_ID_MISMATCH":
			return rpc.NewRPCError(rpc.CodeInvalidParams, "dsh session workspace mismatch")
		case "YISHAN_SESSION_NOT_PERSISTED":
			return rpc.NewRPCError(rpc.CodeNotFound, "dsh session not found")
		case "YISHAN_DURABILITY_UNAVAILABLE":
			return rpc.NewRPCErrorWithData(rpc.CodeServerError, "dsh runtime unavailable", map[string]any{
				"code": rpc.ErrorDataCodeDSHRuntimeUnavailable,
			})
		}
	}
	return rpc.NewRPCError(rpc.CodeServerError, "dsh request failed")
}

func dshRequestErrorCode(raw json.RawMessage) string {
	var data struct {
		Code string `json:"code"`
	}
	if json.Unmarshal(raw, &data) != nil {
		return ""
	}
	return data.Code
}
