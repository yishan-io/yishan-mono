package agent

import (
	"context"
	"errors"
	"strings"

	"yishan/apps/cli/internal/platform/config"

	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/agent/session"
	"yishan/apps/cli/internal/rpc"
	terminalruntime "yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

// ErrWorkspaceCleanupAborted tells a joiner that a direct cleanup reopened the workspace.
var ErrWorkspaceCleanupAborted = errors.New("workspace cleanup aborted")

func (s *Service) Start(ctx context.Context, connState *rpc.Connection, req rpc.PiStartParams) (any, error) {
	if err := validatePiStart(req); err != nil {
		return nil, err
	}
	claim, err := s.runtimeIdentities.claim(req.SessionID, rpc.AgentRuntimePi)
	if err != nil {
		return nil, err
	}
	admission, err := s.piSessions.Admit(req.WorkspaceID)
	if err != nil {
		if claim.isFresh {
			s.runtimeIdentities.release(req.SessionID, rpc.AgentRuntimePi)
		}
		return nil, workspaceClosingError(req.WorkspaceID)
	}
	result, err := s.startAdmittedPi(ctx, admission, connState, req)
	if err != nil && claim.isFresh {
		s.runtimeIdentities.release(req.SessionID, rpc.AgentRuntimePi)
	}
	return result, err
}

func validatePiStart(req rpc.PiStartParams) error {
	if req.SessionID == "" {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "sessionId is required")
	}
	if req.CWD == "" {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "cwd is required")
	}
	return nil
}

func workspaceClosingError(workspaceID string) error {
	return rpc.NewRPCError(rpc.CodeNotFound, "workspace is closing: "+workspaceID)
}

// SetAfterWorkspaceCleanupAdmissionClosedForTest installs a focused-test hook
// that runs after a workspace close blocks new agent admissions.
func (s *Service) SetAfterWorkspaceCleanupAdmissionClosedForTest(hook func()) {
	s.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(hook)
}

func (s *Service) startAdmittedPi(ctx context.Context, admission *session.Admission, connState *rpc.Connection, req rpc.PiStartParams) (any, error) {
	defer s.piSessions.ReleaseAdmission(admission)
	if err := s.rejectEndedTaskRun(req.SessionID); err != nil {
		return nil, err
	}
	proc, err := s.startPiProcess(ctx, req)
	if err != nil {
		return nil, err
	}
	if !s.registerAdmittedPi(admission, connState, proc, req) {
		return nil, workspaceClosingError(req.WorkspaceID)
	}
	return map[string]any{"sessionId": req.SessionID}, nil
}

func (s *Service) rejectEndedTaskRun(sessionID string) error {
	state, exists := s.piSessions.Get(sessionID)
	if !exists || !state.TaskRun {
		return nil
	}
	if _, alive := s.deps.AgentMgr.Session(sessionID); alive {
		return nil
	}
	s.piSessions.Delete(sessionID)
	log.Warn().Str("sessionId", sessionID).Msg("pi.start: task run session ended before attach")
	return rpc.NewRPCError(rpc.CodeNotFound, "task run session ended before it could be attached: "+sessionID)
}

type piStartConfig struct {
	args     []string
	extraEnv []string
}

func (s *Service) startPiProcess(ctx context.Context, req rpc.PiStartParams) (*process.Session, error) {
	config, err := s.buildPiStartConfig(req)
	if err != nil {
		return nil, err
	}
	if err := s.deps.AgentLifecycleCtx.Err(); err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "daemon is shutting down")
	}
	proc, err := s.startPiProcessOnce(req, config)
	if !errors.Is(err, process.ErrSessionExists) {
		return proc, startPiProcessError(err)
	}
	return s.retryPiStartAfterStop(ctx, req, config)
}

func (s *Service) buildPiStartConfig(req rpc.PiStartParams) (piStartConfig, error) {
	if s.deps.Workspace == nil {
		return piStartConfig{}, rpc.NewRPCError(rpc.CodeServerError, "workspace resolver is unavailable")
	}
	resolved, err := s.deps.Workspace.GetWorkspace(req.WorkspaceID)
	if err != nil {
		return piStartConfig{}, err
	}
	extraEnv, err := buildPiStartExtraEnv(req, resolved, s.deps.DaemonWSEndpoint)
	if err != nil {
		return piStartConfig{}, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	return piStartConfig{args: buildPiStartArgs(req), extraEnv: extraEnv}, nil
}

func buildPiStartArgs(req rpc.PiStartParams) []string {
	args := []string{"--mode", "rpc", "--name", req.TabID, "--approve"}
	if req.Resume {
		return append(args, "--session", req.SessionID)
	}
	return append(args, "--session-id", req.SessionID)
}

func (s *Service) startPiProcessOnce(req rpc.PiStartParams, config piStartConfig) (*process.Session, error) {
	return s.deps.AgentMgr.Start(s.deps.AgentLifecycleCtx, process.StartOptions{
		SessionID: req.SessionID, TabID: req.TabID, WorkspaceID: req.WorkspaceID,
		Binary: "pi", Args: config.args, CWD: req.CWD, ExtraEnv: config.extraEnv, DaemonWSEndpoint: s.deps.DaemonWSEndpoint,
		OnEvent: s.makePiEventCallback(req.SessionID), OnExit: s.handlePiSessionExit,
	})
}

func startPiProcessError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, process.ErrSessionExists) {
		return rpc.NewRPCError(rpc.CodeSessionExists, err.Error())
	}
	return rpc.NewRPCError(rpc.CodeServerError, err.Error())
}

func (s *Service) retryPiStartAfterStop(ctx context.Context, req rpc.PiStartParams, config piStartConfig) (*process.Session, error) {
	if s.afterStartStopConflict != nil {
		s.afterStartStopConflict()
	}
	if !s.piSessions.WaitForStop(ctx, s.deps.AgentMgr, req.SessionID) {
		return nil, startPiProcessError(process.ErrSessionExists)
	}
	proc, err := s.startPiProcessOnce(req, config)
	return proc, startPiProcessError(err)
}

func (s *Service) registerAdmittedPi(admission *session.Admission, connState *rpc.Connection, proc *process.Session, req rpc.PiStartParams) bool {
	if s.afterProcessStart != nil {
		s.afterProcessStart()
	}
	if s.piSessions.RegisterAdmission(admission, req.SessionID, connState, proc, req.TabID, req.CWD, false) {
		if _, alive := s.deps.AgentMgr.Session(req.SessionID); !alive {
			s.handlePiSessionExit(proc)
		}
		return true
	}
	stopErr := s.stopProcess(proc)
	s.piSessions.RejectAdmission(admission, req.SessionID, connState, proc, req.TabID, req.CWD, false, stopErr)
	return false
}

func (s *Service) Attach(ctx context.Context, connState *rpc.Connection, req rpc.PiAttachParams) (any, error) {
	if req.SessionID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "sessionId is required")
	}
	if err := s.waitForPiStart(ctx, req.SessionID); err != nil {
		return nil, err
	}
	if err := s.attachPiSession(connState, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) waitForPiStart(ctx context.Context, sessionID string) error {
	if s.afterAttachWaitForStart != nil {
		s.afterAttachWaitForStart()
	}
	if !s.piSessions.WaitForStart(ctx, s.deps.AgentMgr, sessionID) {
		return rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+sessionID)
	}
	return nil
}

func (s *Service) attachPiSession(connState *rpc.Connection, req rpc.PiAttachParams) error {
	_, err := s.piSessions.AttachLive(s.deps.AgentMgr, req.SessionID, connState, req.TabID, req.WorkspaceID, req.CWD)
	if errors.Is(err, session.ErrWorkspaceClosing) || errors.Is(err, session.ErrWorkspaceMismatch) || errors.Is(err, session.ErrSessionStopping) || errors.Is(err, session.ErrSessionNotLive) {
		return rpc.NewRPCError(rpc.CodeNotFound, err.Error()+": "+req.SessionID)
	}
	if err != nil {
		return rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	if _, exists := s.piSessions.Get(req.SessionID); !exists {
		return rpc.NewRPCError(rpc.CodeNotFound, "pi session not found: "+req.SessionID)
	}
	return nil
}

func buildPiStartExtraEnv(req rpc.PiStartParams, resolvedWorkspace workspace.Workspace, daemonWSEndpoint string) ([]string, error) {
	env, err := terminalruntime.ResolveSessionMetadataEnv(nil, terminalruntime.StartRequest{
		WorkspaceID: req.WorkspaceID, ProjectID: resolvedWorkspace.ProjectID, OrgID: resolvedWorkspace.OrgID,
		TabID: req.TabID, PaneID: resolvePiStartPaneID(req.TabID, req.PaneID),
	})
	if err != nil {
		return nil, err
	}
	return config.OverrideDaemonWSEndpointEnv(env, daemonWSEndpoint), nil
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

func (s *Service) Stop(ctx context.Context, req rpc.PiStopParams) (any, error) {
	if req.SessionID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "sessionId is required")
	}
	if err := s.stopRegisteredSession(ctx, req.SessionID); err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) stopRegisteredSession(ctx context.Context, sessionID string) error {
	claim, _, exists := s.piSessions.ClaimStop(sessionID)
	if !exists {
		return nil
	}
	return s.stopClaim(ctx, claim)
}

func (s *Service) stopClaim(ctx context.Context, claim *session.StopClaim) error {
	if !claim.IsOwner() {
		return claim.Wait(ctx)
	}
	if s.afterStopClaim != nil {
		s.afterStopClaim()
	}
	err := s.stopProcess(claim.Process())
	s.piSessions.CompleteStop(claim, err)
	if err == nil {
		s.runtimeIdentities.release(claim.Process().ID(), rpc.AgentRuntimePi)
	}
	return err
}

// WorkspaceAgentCleanup identifies one workspace cleanup lifecycle. A joiner
// may inspect its ownership, but only its owner can commit or abort it.
type WorkspaceAgentCleanup struct {
	cleanup *session.WorkspaceCleanup
	stop    *workspaceStop
	isOwner bool
	err     error
}

// IsOwner reports whether this caller owns the cleanup lifecycle.
func (h *WorkspaceAgentCleanup) IsOwner() bool {
	return h != nil && h.isOwner
}

type workspaceStopOutcome uint8

const (
	workspaceStopCommitted workspaceStopOutcome = iota + 1
	workspaceStopAborted
)

type workspaceStop struct {
	done    chan struct{}
	err     error
	outcome workspaceStopOutcome
}

// StopWorkspaceSessions starts or joins the workspace cleanup lifecycle.
func (s *Service) StopWorkspaceSessions(ctx context.Context, workspaceID string) error {
	for {
		handle, err := s.BeginWorkspaceAgentCleanup(ctx, workspaceID)
		if !handle.IsOwner() {
			if errors.Is(err, ErrWorkspaceCleanupAborted) {
				continue
			}
			return err
		}
		if err != nil {
			s.AbortWorkspaceAgentCleanup(handle)
			return err
		}
		s.CommitWorkspaceAgentCleanup(handle)
		return nil
	}
}

func (s *Service) claimWorkspaceStop(workspaceID string) (*workspaceStop, bool) {
	s.workspaceStopsMu.Lock()
	defer s.workspaceStopsMu.Unlock()
	if stop := s.workspaceStops[workspaceID]; stop != nil {
		return stop, false
	}
	stop := &workspaceStop{done: make(chan struct{})}
	s.workspaceStops[workspaceID] = stop
	return stop, true
}

func (s *Service) waitWorkspaceStop(ctx context.Context, stop *workspaceStop) error {
	if s.afterWorkspaceStopWaiter != nil {
		s.afterWorkspaceStopWaiter()
	}
	select {
	case <-stop.done:
		return stop.result()
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (stop *workspaceStop) result() error {
	if stop.outcome == workspaceStopAborted && stop.err == nil {
		return ErrWorkspaceCleanupAborted
	}
	return stop.err
}

// BeginWorkspaceAgentCleanup starts or joins the sole cleanup lifecycle for a
// workspace. Joiners wait for the owner's final commit or abort result.
func (s *Service) BeginWorkspaceAgentCleanup(ctx context.Context, workspaceID string) (*WorkspaceAgentCleanup, error) {
	stop, isOwner := s.claimWorkspaceStop(workspaceID)
	if !isOwner {
		return &WorkspaceAgentCleanup{stop: stop}, s.waitWorkspaceStop(ctx, stop)
	}
	cleanup, claims, beginErr := s.piSessions.BeginWorkspaceCleanup(ctx, workspaceID)
	handle := &WorkspaceAgentCleanup{cleanup: cleanup, stop: stop, isOwner: true}
	if beginErr != nil && len(claims) == 0 {
		handle.err = beginErr
		return handle, beginErr
	}
	if s.afterWorkspaceClaims != nil {
		s.afterWorkspaceClaims()
	}
	handle.err = errors.Join(beginErr, s.stopWorkspaceClaims(ctx, claims), s.stopDSHWorkspaceSessions(ctx, workspaceID))
	return handle, handle.err
}

func (s *Service) stopWorkspaceClaims(ctx context.Context, claims []*session.StopClaim) error {
	var failures []error
	for _, claim := range claims {
		if claim.IsOwner() {
			stopErr := s.stopProcess(claim.Process())
			s.piSessions.CompleteStop(claim, stopErr)
			if stopErr != nil {
				failures = append(failures, stopErr)
			}
			continue
		}
		if waitErr := claim.Wait(ctx); waitErr != nil {
			failures = append(failures, waitErr)
		}
	}
	return errors.Join(failures...)
}

// AbortWorkspaceAgentCleanup aborts an owner lifecycle and publishes its
// result only when it wins the registry transition.
func (s *Service) AbortWorkspaceAgentCleanup(handle *WorkspaceAgentCleanup) {
	s.finishWorkspaceAgentCleanup(handle, workspaceStopAborted)
}

// CommitWorkspaceAgentCleanup commits an owner lifecycle and publishes its
// result only when it wins the registry transition.
func (s *Service) CommitWorkspaceAgentCleanup(handle *WorkspaceAgentCleanup) {
	s.finishWorkspaceAgentCleanup(handle, workspaceStopCommitted)
}

func (s *Service) finishWorkspaceAgentCleanup(handle *WorkspaceAgentCleanup, outcome workspaceStopOutcome) {
	if handle == nil || !handle.IsOwner() || handle.cleanup == nil {
		return
	}
	s.workspaceStopsMu.Lock()
	defer s.workspaceStopsMu.Unlock()
	if s.workspaceStops[handle.cleanup.WorkspaceID()] != handle.stop {
		return
	}
	if !s.transitionWorkspaceCleanup(handle, outcome) {
		return
	}
	handle.stop.err = handle.err
	handle.stop.outcome = outcome
	close(handle.stop.done)
	if outcome == workspaceStopAborted {
		delete(s.workspaceStops, handle.cleanup.WorkspaceID())
	}
}

func (s *Service) transitionWorkspaceCleanup(handle *WorkspaceAgentCleanup, outcome workspaceStopOutcome) bool {
	if outcome == workspaceStopAborted {
		return s.piSessions.AbortWorkspaceCleanup(handle.cleanup)
	}
	return s.piSessions.CommitWorkspaceCleanup(handle.cleanup)
}
