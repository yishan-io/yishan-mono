package agent

import (
	"context"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestPiStart_BeginCleanupWaitsForRPCStartAndStopsCrossingProcess(t *testing.T) {
	installBlockingFakePiBinary(t)
	s := newTestHandler(t)
	entered := make(chan struct{})
	release := make(chan struct{})
	cleanupMarkerInstalled := make(chan struct{})
	s.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(func() { close(cleanupMarkerInstalled) })
	s.afterProcessStart = func() { close(entered); <-release }
	startDone := make(chan error, 1)
	go func() {
		_, err := s.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{SessionID: "rpc-crossing", TabID: "tab", WorkspaceID: "ws", CWD: t.TempDir()})
		startDone <- err
	}()
	<-entered
	cleanupDone := make(chan error, 1)
	go func() { cleanupDone <- s.StopWorkspaceSessions(context.Background(), "ws") }()
	<-cleanupMarkerInstalled // Cleanup blocks admissions before the crossing start is released.
	close(release)
	if err := <-startDone; err == nil {
		t.Fatal("expected start crossing cleanup to be rejected")
	}
	if err := <-cleanupDone; err != nil {
		t.Fatalf("cleanup error = %v", err)
	}
	if _, exists := s.deps.AgentMgr.Session("rpc-crossing"); exists {
		t.Fatal("crossing RPC process remained active")
	}
}

func TestPiStart_BeginCleanupWaitsForConcurrentStarts(t *testing.T) {
	installBlockingFakePiBinary(t)
	s := newTestHandler(t)
	entered, release := blockConcurrentPiStarts(s, 2)
	startDone := startConcurrentPiStarts(s, t.TempDir())
	<-entered
	<-entered

	cleanupMarkerInstalled := make(chan struct{})
	s.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(func() { close(cleanupMarkerInstalled) })
	cleanupDone := make(chan error, 1)
	go func() { cleanupDone <- s.StopWorkspaceSessions(context.Background(), "ws") }()
	<-cleanupMarkerInstalled
	release <- struct{}{}
	assertCleanupWaitsForSecondStart(t, cleanupDone)
	release <- struct{}{}
	assertConcurrentStartsAreStopped(t, startDone, cleanupDone)
}

func blockConcurrentPiStarts(s *Service, starts int) (<-chan struct{}, chan<- struct{}) {
	entered := make(chan struct{}, starts)
	release := make(chan struct{}, starts)
	s.afterProcessStart = func() { entered <- struct{}{}; <-release }
	return entered, release
}

func startConcurrentPiStarts(s *Service, cwd string) <-chan error {
	done := make(chan error, 2)
	for _, sessionID := range []string{"rpc-crossing-one", "rpc-crossing-two"} {
		go func(id string) {
			_, err := s.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{SessionID: id, TabID: id, WorkspaceID: "ws", CWD: cwd})
			done <- err
		}(sessionID)
	}
	return done
}

func assertCleanupWaitsForSecondStart(t *testing.T, cleanupDone <-chan error) {
	t.Helper()
	select {
	case err := <-cleanupDone:
		t.Fatalf("cleanup returned before second start resolved: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
}

func assertConcurrentStartsAreStopped(t *testing.T, startDone, cleanupDone <-chan error) {
	t.Helper()
	for range 2 {
		if err := <-startDone; err == nil {
			t.Fatal("expected start crossing cleanup to be rejected")
		}
	}
	if err := <-cleanupDone; err != nil {
		t.Fatalf("cleanup error = %v", err)
	}
}

func TestTaskRun_BeginCleanupWaitsForTaskRunStart(t *testing.T) {
	installBlockingFakePiBinary(t)
	s := newTestHandler(t)
	registerTestDesktopConn(s)
	entered := make(chan struct{})
	release := make(chan struct{})
	cleanupMarkerInstalled := make(chan struct{})
	s.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(func() { close(cleanupMarkerInstalled) })
	s.afterProcessStart = func() { close(entered); <-release }
	result := make(chan string, 1)
	workspaceState := workspace.Workspace{ID: "ws", Path: t.TempDir()}
	go func() {
		status, _ := s.startTaskRunChatSession(workspaceState, &workspace.TaskRunConfig{Prompt: "run"})
		result <- status
	}()
	<-entered
	cleanupDone := make(chan error, 1)
	go func() { cleanupDone <- s.StopWorkspaceSessions(context.Background(), "ws") }()
	<-cleanupMarkerInstalled // Cleanup blocks admissions before the task run is released.
	close(release)
	if status := <-result; status != "failed" {
		t.Fatalf("task run status = %q, want failed", status)
	}
	if err := <-cleanupDone; err != nil {
		t.Fatalf("cleanup error = %v", err)
	}
}

func TestPiAttach_WaitsForManagerRegistryGap(t *testing.T) {
	installBlockingFakePiBinary(t)
	s := newTestHandler(t)
	entered := make(chan struct{})
	release := make(chan struct{})
	s.afterProcessStart = func() { close(entered); <-release }
	startDone := make(chan error, 1)
	go func() {
		_, err := s.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{SessionID: "gap", TabID: "tab", WorkspaceID: "ws", CWD: t.TempDir()})
		startDone <- err
	}()
	<-entered
	attachEnteredWaitForStart := make(chan struct{})
	s.afterAttachWaitForStart = func() { close(attachEnteredWaitForStart) }
	attachDone := make(chan error, 1)
	go func() {
		_, err := s.Attach(context.Background(), &rpc.Connection{}, rpc.PiAttachParams{SessionID: "gap", TabID: "reconnect"})
		attachDone <- err
	}()
	<-attachEnteredWaitForStart // Attach is waiting for registry metadata.
	close(release)
	if err := <-startDone; err != nil {
		t.Fatal(err)
	}
	if err := <-attachDone; err != nil {
		t.Fatalf("attach error = %v", err)
	}
	if err := s.stopRegisteredSession(context.Background(), "gap"); err != nil {
		t.Fatal(err)
	}
}

func TestPiAttach_BeginCleanupRejectsOmittedAndMismatchedWorkspace(t *testing.T) {
	installBlockingFakePiBinary(t)
	s := newTestHandler(t)
	_, err := s.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{SessionID: "owned", TabID: "tab", WorkspaceID: "ws", CWD: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	entered := make(chan struct{})
	release := make(chan struct{})
	s.stopProcess = func(proc *process.Session) error { close(entered); <-release; return proc.Close() }
	cleanupDone := make(chan error, 1)
	go func() { cleanupDone <- s.StopWorkspaceSessions(context.Background(), "ws") }()
	<-entered
	for _, workspaceID := range []string{"", "other"} {
		_, attachErr := s.Attach(context.Background(), &rpc.Connection{}, rpc.PiAttachParams{SessionID: "owned", WorkspaceID: workspaceID})
		if attachErr == nil {
			t.Fatalf("attach with workspace %q succeeded during cleanup", workspaceID)
		}
	}
	close(release)
	if err := <-cleanupDone; err != nil {
		t.Fatal(err)
	}
}
