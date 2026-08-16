package agent

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
)

func TestPiStart_ConnectionContextCancellationKeepsSessionAlive(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connectionCtx, cancelConnection := context.WithCancel(context.Background())
	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(connectionCtx, connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-survives-disconnect",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	cancelConnection()
	time.Sleep(100 * time.Millisecond)

	session, exists := s.deps.AgentMgr.Session("session-survives-disconnect")
	if !exists {
		t.Fatal("expected pi session to remain active after its WebSocket context was cancelled")
	}

	reconnectedConnState := &rpc.Connection{}
	_, err = s.callAgentRPCForTest(context.Background(), reconnectedConnState, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-survives-disconnect",
		"tabId":     "tab-reconnected",
	}))
	if err != nil {
		t.Fatalf("dispatchPi attach after reconnect: %v", err)
	}

	s.Shutdown()
	if _, exists := s.deps.AgentMgr.Session(session.ID()); exists {
		t.Fatal("pi session remained active after daemon shutdown")
	}
	if _, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-after-shutdown",
		"tabId":       "tab-2",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	})); err == nil {
		t.Fatal("expected pi start to be rejected after daemon shutdown")
	}
}

func TestPiStart_ReturnsSessionExistsRPCCode(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-exists",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("first dispatchPi start: %v", err)
	}
	defer func() {
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-exists",
		}))
	}()

	_, err = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-exists",
		"tabId":       "tab-2",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
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

func TestPiAttach_WaitsForConcurrentStart(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	// Hold the winner's Start in its reservation window (id in `starting`, not
	// yet in `sessions`), exactly the state a second tab's attach races.
	releaseGate := make(chan struct{})
	agentmanager.StartGate = func() {
		<-releaseGate
	}
	t.Cleanup(func() { agentmanager.StartGate = nil })

	startDone := make(chan struct{})
	go func() {
		defer close(startDone)
		_, _ = s.callAgentRPCForTest(context.Background(), &rpc.Connection{}, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
			"sessionId":   "session-concurrent",
			"tabId":       "tab-1",
			"workspaceId": "workspace-1",
			"cwd":         cwd,
		}))
	}()
	waitForStartingReservation(t, s, "session-concurrent")

	// A second opener attaches while the start is still in flight: it must wait
	// for the start to finish and then bind to the winning process.
	attachConnState := &rpc.Connection{}
	attachDone := make(chan error, 1)
	go func() {
		_, err := s.callAgentRPCForTest(context.Background(), attachConnState, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
			"sessionId":   "session-concurrent",
			"tabId":       "tab-2",
			"workspaceId": "workspace-1",
			"cwd":         cwd,
		}))
		attachDone <- err
	}()

	// The attach must not fail (or resolve) while the start is still reserved.
	select {
	case err := <-attachDone:
		t.Fatalf("attach resolved before the start finished: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	close(releaseGate)
	<-startDone
	if err := <-attachDone; err != nil {
		t.Fatalf("attach during concurrent start: %v", err)
	}

	// The winner's registry entry must be intact and owned by the attached tab.
	state, exists := s.piSessions.Get("session-concurrent")
	if !exists {
		t.Fatal("expected the concurrent start's session to remain registered")
	}
	if state.Conn != attachConnState {
		t.Fatal("expected the attaching tab to own the session after the wait")
	}
}

func TestPiStart_WaitsForStoppingSessionThenStartsFresh(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installSlowExitFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-race",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("first dispatchPi start: %v", err)
	}

	// Close the session in the background so the teardown is in flight when the
	// reopen's pi.start arrives.
	stopDone := make(chan struct{})
	go func() {
		defer close(stopDone)
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-race",
		}))
	}()
	waitForStoppingMarker(t, s, "session-race")

	// A reopen of the same id during the teardown must wait and then start a
	// fresh process instead of failing with ErrSessionExists.
	startStartedAt := time.Now()
	_, err = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-race",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start during stop: %v", err)
	}
	if time.Since(startStartedAt) < 200*time.Millisecond {
		t.Fatalf("expected pi.start to wait for the in-flight stop, took %v", time.Since(startStartedAt))
	}
	<-stopDone

	if _, exists := s.deps.AgentMgr.Session("session-race"); !exists {
		t.Fatal("expected a fresh session after the reopen")
	}
	state, exists := s.piSessions.Get("session-race")
	if !exists || state.TabID != "tab-reopened" {
		t.Fatalf("expected reopened tab to own the fresh session, got %#v", state)
	}
}

func TestPiStart_RetriesWhenStopMarkerArrivesLate(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installSlowExitFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-race-late",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("first dispatchPi start: %v", err)
	}

	// Dispatch the stop and the reopen back-to-back WITHOUT waiting for the
	// stopping marker: pi.start's first attempt may see ErrSessionExists before
	// the marker is set. It must retry after the teardown and start fresh.
	stopDone := make(chan struct{})
	go func() {
		defer close(stopDone)
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-race-late",
		}))
	}()

	_, err = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-race-late",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start racing a late stop marker: %v", err)
	}
	<-stopDone

	if _, exists := s.deps.AgentMgr.Session("session-race-late"); !exists {
		t.Fatal("expected a fresh session after the retried reopen")
	}
	state, exists := s.piSessions.Get("session-race-late")
	if !exists || state.TabID != "tab-reopened" {
		t.Fatalf("expected reopened tab to own the fresh session, got %#v", state)
	}
}

func TestPiAttach_RejectsStoppingSession(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installSlowExitFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach-stop",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}

	stopDone := make(chan struct{})
	go func() {
		defer close(stopDone)
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-attach-stop",
		}))
	}()
	waitForStoppingMarker(t, s, "session-attach-stop")

	// Attach during the teardown must not rebind a doomed process.
	reboundConnState := &rpc.Connection{}
	_, err = s.callAgentRPCForTest(context.Background(), reboundConnState, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach-stop",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-2",
		"cwd":         cwd,
	}))
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

	// The rejected attach must not have rebound the connection or routing
	// metadata: while the entry still exists (the in-flight stop may have
	// already deleted it), the original tab must still own the session.
	state, exists := s.piSessions.Get("session-attach-stop")
	if exists {
		if state.Conn != connState {
			t.Fatal("expected the rejected attach to leave connState unchanged")
		}
		if state.TabID != "tab-1" {
			t.Fatalf("expected the rejected attach to leave tabID unchanged, got %q", state.TabID)
		}
	}

	<-stopDone
}

func TestPiAttach_RebindsConnectionAndTabRoutingMetadata(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	originalConnState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), originalConnState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach",
		"tabId":       "tab-attach",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	defer func() {
		_, _ = s.callAgentRPCForTest(context.Background(), originalConnState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-attach",
		}))
	}()

	reboundConnState := &rpc.Connection{}
	_, err = s.callAgentRPCForTest(context.Background(), reboundConnState, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-2",
		"cwd":         filepath.Join(homeDir, "worktrees", "pi-project-reopened"),
	}))
	if err != nil {
		t.Fatalf("dispatchPi attach: %v", err)
	}

	state, _ := s.piSessions.Get("session-attach")
	if state == nil {
		t.Fatal("expected pi session state to exist after attach")
	}
	if state.Conn != reboundConnState {
		t.Fatalf("expected attach to rebind connState")
	}
	if state.TabID != "tab-reopened" {
		t.Fatalf("expected attach to rebind tabID, got %q", state.TabID)
	}
	if state.WorkspaceID != "workspace-2" {
		t.Fatalf("expected attach to rebind workspaceID, got %q", state.WorkspaceID)
	}
	if state.CWD != filepath.Join(homeDir, "worktrees", "pi-project-reopened") {
		t.Fatalf("expected attach to rebind cwd, got %q", state.CWD)
	}
}
