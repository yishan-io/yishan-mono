package agent

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestPiStart_ConnectionContextCancellationKeepsSessionAlive(t *testing.T) {
	s, conn, cwd := startDisconnectSurvivalSession(t)
	assertPiSessionSurvivesDisconnect(t, s, conn, cwd)
	assertPiStartRejectedAfterShutdown(t, s, conn, cwd)
}

func startDisconnectSurvivalSession(t *testing.T) (*Service, *rpc.Connection, string) {
	t.Helper()
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}
	connectionCtx, cancel := context.WithCancel(context.Background())
	conn := &rpc.Connection{}
	s := newTestHandler(t)
	_, err := s.callAgentRPCForTest(connectionCtx, conn, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-survives-disconnect", "tabId": "tab-1", "workspaceId": "workspace-1", "cwd": cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	cancel()
	return s, conn, cwd
}

func assertPiSessionSurvivesDisconnect(t *testing.T, s *Service, conn *rpc.Connection, cwd string) {
	t.Helper()
	time.Sleep(100 * time.Millisecond)
	session, exists := s.deps.AgentMgr.Session("session-survives-disconnect")
	if !exists {
		t.Fatal("expected pi session to remain active after its WebSocket context was cancelled")
	}
	_, err := s.callAgentRPCForTest(context.Background(), &rpc.Connection{}, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{"sessionId": "session-survives-disconnect", "tabId": "tab-reconnected"}))
	if err != nil {
		t.Fatalf("dispatchPi attach after reconnect: %v", err)
	}
	s.Shutdown()
	if _, exists := s.deps.AgentMgr.Session(session.ID()); exists {
		t.Fatal("pi session remained active after daemon shutdown")
	}
}

func assertPiStartRejectedAfterShutdown(t *testing.T, s *Service, conn *rpc.Connection, cwd string) {
	t.Helper()
	_, err := s.callAgentRPCForTest(context.Background(), conn, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-after-shutdown", "tabId": "tab-2", "workspaceId": "workspace-1", "cwd": cwd,
	}))
	if err == nil {
		t.Fatal("expected pi start to be rejected after daemon shutdown")
	}
}

func TestPiStart_ReturnsSessionExistsRPCCode(t *testing.T) {
	s, conn, cwd := newPiStartService(t)
	startPiSession(t, s, conn, "session-exists", "tab-1", "workspace-1", cwd)
	defer stopPiForAttachTest(t, s, conn, "session-exists")

	_, err := s.callAgentRPCForTest(context.Background(), conn, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-exists", "tabId": "tab-2", "workspaceId": "workspace-1", "cwd": cwd,
	}))
	assertSessionExistsRPCError(t, err)
}

func assertSessionExistsRPCError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected duplicate session error")
	}
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Code != rpc.CodeSessionExists {
		t.Fatalf("expected rpc code %d, got %d", rpc.CodeSessionExists, rpcErr.Code)
	}
}

func TestPiStart_OverridesLegacyAgentDirEnv(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	legacyAgentDir := filepath.Join(homeDir, ".yishan")
	t.Setenv(config.PiAgentDirEnvKey, legacyAgentDir)

	markerPath := filepath.Join(homeDir, "pi-agent-dir.txt")
	installFakePiBinary(t, markerPath)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-1",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi: %v", err)
	}

	got := waitForFileContent(t, markerPath)
	want := filepath.Join(homeDir, ".yishan", "pi", "agent")
	if got != want {
		t.Fatalf("PI_CODING_AGENT_DIR = %q, want %q", got, want)
	}
	if got == legacyAgentDir {
		t.Fatalf("expected managed pi agent dir to override legacy dir %q", legacyAgentDir)
	}
}

func TestPiStart_InjectsAuthoritativeWorkspaceIdentityEnv(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("YISHAN_PROJECT_ID", "forged-project")
	t.Setenv("YISHAN_ORG_ID", "forged-org")

	markerPath := filepath.Join(homeDir, "pi-env.txt")
	fakePiDir := t.TempDir()
	fakePi := filepath.Join(fakePiDir, "pi")
	fakePiScript := fmt.Sprintf("#!/bin/sh\nenv > %q.tmp && mv %q.tmp %q\nIFS= read -r _ || exit 0\n", markerPath, markerPath, markerPath)
	if err := os.WriteFile(fakePi, []byte(fakePiScript), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", fakePiDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	s := newTestHandler(t)
	s.deps.Workspace = testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		if workspaceID != "workspace-1" {
			return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeNotFound, "workspace not found")
		}
		return workspace.Workspace{ID: workspaceID, ProjectID: "project-from-daemon", OrgID: "org-from-daemon"}, nil
	})
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	startPiIdentityEnvSession(t, s, cwd)
	assertPiIdentityEnv(t, markerPath, homeDir)
}

func startPiIdentityEnvSession(t *testing.T, s *Service, cwd string) {
	t.Helper()
	conn := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), conn, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-identity-env", "tabId": "tab-1", "paneId": "pane-1", "workspaceId": "workspace-1", "cwd": cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	t.Cleanup(func() { stopPiForAttachTest(t, s, conn, "session-identity-env") })
}

func assertPiIdentityEnv(t *testing.T, markerPath, homeDir string) {
	t.Helper()
	env := strings.Split(waitForFileContent(t, markerPath), "\n")
	assertEnvValue(t, env, "YISHAN_WORKSPACE_ID", "workspace-1")
	assertEnvValue(t, env, "YISHAN_PROJECT_ID", "project-from-daemon")
	assertEnvValue(t, env, "YISHAN_ORG_ID", "org-from-daemon")
	assertEnvValue(t, env, "YISHAN_TAB_ID", "tab-1")
	assertEnvValue(t, env, "YISHAN_PANE_ID", "pane-1")
	assertEnvValue(t, env, config.PiAgentDirEnvKey, filepath.Join(homeDir, ".yishan", "pi", "agent"))
}

func TestPiStart_RejectsUnknownWorkspace(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	s.deps.Workspace = testWorkspaceResolver(func(string) (workspace.Workspace, error) {
		return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeNotFound, "workspace not found")
	})
	cwd := filepath.Join(homeDir, "worktrees", "unknown")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	_, err := s.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{
		SessionID:   "session-unknown-workspace",
		TabID:       "tab-1",
		WorkspaceID: "unknown-workspace",
		CWD:         cwd,
	})
	if err == nil {
		t.Fatal("expected pi.start to reject an unknown workspace")
	}
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) || rpcErr.Code != rpc.CodeNotFound {
		t.Fatalf("error = %v, want rpc.CodeNotFound", err)
	}
	if _, exists := s.deps.AgentMgr.Session("session-unknown-workspace"); exists {
		t.Fatal("pi.start started a session for an unknown workspace")
	}
}

func TestPiAttach_WaitsForConcurrentStart(t *testing.T) {
	fixture := startConcurrentPiSession(t)
	attachConn := &rpc.Connection{}
	attachWaiting := make(chan struct{})
	fixture.service.afterAttachWaitForStart = func() { close(attachWaiting) }
	attachDone := attachConcurrentPiSession(t, fixture, attachConn)
	<-attachWaiting
	close(fixture.releaseGate)
	<-fixture.startDone
	if err := <-attachDone; err != nil {
		t.Fatalf("attach during concurrent start: %v", err)
	}
	assertConcurrentPiAttach(t, fixture.service, attachConn)
}

type concurrentPiStartFixture struct {
	service     *Service
	releaseGate chan struct{}
	startDone   chan struct{}
}

func startConcurrentPiSession(t *testing.T) concurrentPiStartFixture {
	t.Helper()
	s, _, cwd := newPiStartService(t)
	releaseGate := make(chan struct{})
	agentmanager.StartGate = func() { <-releaseGate }
	t.Cleanup(func() { agentmanager.StartGate = nil })
	startDone := make(chan struct{})
	go func() {
		defer close(startDone)
		_, _ = s.callAgentRPCForTest(context.Background(), &rpc.Connection{}, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-concurrent", "tabId": "tab-1", "workspaceId": "workspace-1", "cwd": cwd,
		}))
	}()
	waitForStartingReservation(t, s, "session-concurrent")
	return concurrentPiStartFixture{service: s, releaseGate: releaseGate, startDone: startDone}
}

func attachConcurrentPiSession(t *testing.T, fixture concurrentPiStartFixture, conn *rpc.Connection) <-chan error {
	t.Helper()
	done := make(chan error, 1)
	go func() {
		_, err := fixture.service.callAgentRPCForTest(context.Background(), conn, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-concurrent", "tabId": "tab-2", "workspaceId": "workspace-1",
		}))
		done <- err
	}()
	return done
}

func assertConcurrentPiAttach(t *testing.T, s *Service, conn *rpc.Connection) {
	t.Helper()
	state, exists := s.piSessions.Get("session-concurrent")
	if !exists {
		t.Fatal("expected the concurrent start's session to remain registered")
	}
	if state.Conn != conn {
		t.Fatal("expected the attaching tab to own the session after the wait")
	}
}

func TestPiStart_WaitsForStoppingSessionThenStartsFresh(t *testing.T) {
	s, conn, cwd, stopDone := startStoppingPiSession(t, "session-race")
	startStartedAt := time.Now()
	startPiSession(t, s, conn, "session-race", "tab-reopened", "workspace-1", cwd)
	if time.Since(startStartedAt) < 200*time.Millisecond {
		t.Fatalf("expected pi.start to wait for the in-flight stop, took %v", time.Since(startStartedAt))
	}
	<-stopDone
	assertFreshPiSessionAfterStop(t, s, "session-race", "tab-reopened")
}

func startStoppingPiSession(t *testing.T, sessionID string) (*Service, *rpc.Connection, string, <-chan struct{}) {
	t.Helper()
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installSlowExitFakePiBinary(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}
	s, conn := newTestHandler(t), &rpc.Connection{}
	startPiSession(t, s, conn, sessionID, "tab-1", "workspace-1", cwd)
	stopDone := make(chan struct{})
	go func() {
		defer close(stopDone)
		_, _ = s.callAgentRPCForTest(context.Background(), conn, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{"sessionId": sessionID}))
	}()
	waitForStoppingMarker(t, s, sessionID)
	return s, conn, cwd, stopDone
}

func assertFreshPiSessionAfterStop(t *testing.T, s *Service, sessionID, tabID string) {
	t.Helper()
	if _, exists := s.deps.AgentMgr.Session(sessionID); !exists {
		t.Fatal("expected a fresh session after the reopen")
	}
	state, exists := s.piSessions.Get(sessionID)
	if !exists || state.TabID != tabID {
		t.Fatalf("expected reopened tab to own the fresh session, got %#v", state)
	}
}

func TestPiStart_RetriesAfterPublishedStopMarker(t *testing.T) {
	s, connState, cwd := newPiStartService(t)
	startPiSession(t, s, connState, "session-race-late", "tab-1", "workspace-1", cwd)
	stopMarkerPublished := make(chan struct{})
	allowStopCompletion := make(chan struct{})
	startReachedConflict := make(chan struct{})
	releaseStartRetry := make(chan struct{})
	s.afterStopClaim = func() { close(stopMarkerPublished) }
	s.afterStartStopConflict = func() {
		close(startReachedConflict)
		<-releaseStartRetry
	}
	s.stopProcess = func(proc *agentmanager.Session) error {
		<-allowStopCompletion
		return proc.Close()
	}

	startDone := make(chan error, 1)
	go func() {
		_, startErr := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-race-late", "tabId": "tab-reopened", "workspaceId": "workspace-1", "cwd": cwd,
		}))
		startDone <- startErr
	}()
	<-startReachedConflict // Start received ErrSessionExists before pi.stop claimed it.

	stopDone := make(chan error, 1)
	go func() {
		_, stopErr := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{"sessionId": "session-race-late"}))
		stopDone <- stopErr
	}()
	<-stopMarkerPublished
	finishStartStopRace(t, releaseStartRetry, allowStopCompletion, stopDone, startDone)
	assertFreshPiSessionAfterStop(t, s, "session-race-late", "tab-reopened")
}

func finishStartStopRace(t *testing.T, releaseStartRetry, allowStopCompletion chan<- struct{}, stopDone, startDone <-chan error) {
	t.Helper()
	close(releaseStartRetry)
	close(allowStopCompletion)
	if err := <-stopDone; err != nil {
		t.Fatalf("dispatchPi stop: %v", err)
	}
	if err := <-startDone; err != nil {
		t.Fatalf("dispatchPi start racing a published stop marker: %v", err)
	}
}

func TestPiAttach_RejectsStoppingSession(t *testing.T) {
	s, conn, _, _ := startStoppingPiSession(t, "session-attach-stop")
	_, err := s.callAgentRPCForTest(context.Background(), &rpc.Connection{}, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-attach-stop", "tabId": "tab-reopened", "workspaceId": "workspace-2",
		"cwd": "pi-project-reopened",
	}))
	assertStoppingPiAttachRejected(t, err)
	assertStoppingPiAttachOwnership(t, s, conn)
}

func assertStoppingPiAttachRejected(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected attach to be rejected while the session is stopping")
	}
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Code != rpc.CodeNotFound {
		t.Fatalf("expected rpc code %d, got %d", rpc.CodeNotFound, rpcErr.Code)
	}
}

func assertStoppingPiAttachOwnership(t *testing.T, s *Service, conn *rpc.Connection) {
	t.Helper()
	state, exists := s.piSessions.Get("session-attach-stop")
	if !exists {
		return
	}
	if state.Conn != conn {
		t.Fatal("expected the rejected attach to leave connState unchanged")
	}
	if state.TabID != "tab-1" {
		t.Fatalf("expected the rejected attach to leave tabID unchanged, got %q", state.TabID)
	}
}

func newPiStartService(t *testing.T) (*Service, *rpc.Connection, string) {
	t.Helper()
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}
	return newTestHandler(t), &rpc.Connection{}, cwd
}

func startPiSession(t *testing.T, s *Service, conn *rpc.Connection, sessionID, tabID, workspaceID, cwd string) {
	t.Helper()
	_, err := s.callAgentRPCForTest(context.Background(), conn, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId": sessionID, "tabId": tabID, "workspaceId": workspaceID, "cwd": cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
}
