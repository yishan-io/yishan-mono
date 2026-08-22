package agent

import (
	"context"
	"errors"
	"testing"

	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/agent/session"
	"yishan/apps/cli/internal/rpc"
)

func TestStopWorkspaceSessions_AttemptsAllSessionsAndAggregatesFailures(t *testing.T) {
	s := newTestHandler(t)
	ownedOK := &process.Session{}
	ownedFail := &process.Session{}
	s.piSessions.Register("owned-ok", nil, ownedOK, "", "ws-1", "", false)
	s.piSessions.Register("owned-fail", nil, ownedFail, "", "ws-1", "", false)
	s.piSessions.Register("unrelated", nil, &process.Session{}, "", "ws-2", "", false)
	stopFailure := errors.New("stop failed")
	stopped := make(map[string]int)
	s.stopProcess = func(proc *process.Session) error {
		if proc == ownedOK {
			stopped["owned-ok"]++
		}
		if proc == ownedFail {
			stopped["owned-fail"]++
		}
		if proc == ownedFail {
			return stopFailure
		}
		return nil
	}

	err := s.StopWorkspaceSessions(context.Background(), "ws-1")
	if !errors.Is(err, stopFailure) {
		t.Fatalf("StopWorkspaceSessions error = %v, want stop failure", err)
	}
	if stopped["owned-ok"] != 1 || stopped["owned-fail"] != 1 {
		t.Fatalf("stops = %#v, want every owned session once", stopped)
	}
	if _, exists := s.piSessions.Get("owned-ok"); exists {
		t.Fatal("successful stop retained owned session")
	}
	if _, exists := s.piSessions.Get("owned-fail"); !exists {
		t.Fatal("failed stop removed session needed for retry")
	}
	if _, exists := s.piSessions.Get("unrelated"); !exists {
		t.Fatal("workspace cleanup removed unrelated session")
	}
}

func TestStopWorkspaceSessions_CoalescesLifecycleAndPublishesOwnerFailure(t *testing.T) {
	s := newTestHandler(t)
	s.piSessions.Register("owned", nil, &process.Session{}, "", "ws-1", "", false)
	claimsReady := make(chan struct{})
	waiterClaimed := make(chan struct{})
	allowFailure := make(chan struct{})
	stopFailure := errors.New("stop failed")
	stopCalls := 0
	s.afterWorkspaceClaims = func() { close(claimsReady) }
	s.afterWorkspaceStopWaiter = func() { close(waiterClaimed) }
	s.stopProcess = func(*process.Session) error {
		stopCalls++
		<-allowFailure
		return stopFailure
	}

	ownerDone := make(chan error, 1)
	go func() { ownerDone <- s.StopWorkspaceSessions(context.Background(), "ws-1") }()
	<-claimsReady
	waiterDone := make(chan error, 1)
	go func() { waiterDone <- s.StopWorkspaceSessions(context.Background(), "ws-1") }()
	<-waiterClaimed
	assertWorkspaceCleanupWaits(t, s, waiterDone)
	assertWorkspaceCleanupFailure(t, s, ownerDone, waiterDone, allowFailure, stopFailure, &stopCalls)
}

func assertWorkspaceCleanupWaits(t *testing.T, s *Service, waiterDone <-chan error) {
	t.Helper()
	if _, err := s.piSessions.Admit("ws-1"); !errors.Is(err, session.ErrWorkspaceClosing) {
		t.Fatalf("concurrent cleanup reopened admission: %v", err)
	}
	select {
	case err := <-waiterDone:
		t.Fatalf("waiter returned before lifecycle owner: %v", err)
	default:
	}
}

func assertWorkspaceCleanupFailure(t *testing.T, s *Service, ownerDone, waiterDone <-chan error, allowFailure chan<- struct{}, stopFailure error, stopCalls *int) {
	t.Helper()
	close(allowFailure)
	if err := <-ownerDone; !errors.Is(err, stopFailure) {
		t.Fatalf("owner error = %v, want %v", err, stopFailure)
	}
	if err := <-waiterDone; !errors.Is(err, stopFailure) {
		t.Fatalf("waiter error = %v, want owner's %v", err, stopFailure)
	}
	if *stopCalls != 1 {
		t.Fatalf("stop calls = %d, want one lifecycle owner", *stopCalls)
	}
	admission, err := s.piSessions.Admit("ws-1")
	if err != nil {
		t.Fatalf("failed owner did not safely abort cleanup: %v", err)
	}
	s.piSessions.ReleaseAdmission(admission)
}

func TestStopWorkspaceSessions_PublishesOwnerCancellationToWaiters(t *testing.T) {
	s := newTestHandler(t)
	crossingAdmission, err := s.piSessions.Admit("ws-1")
	if err != nil {
		t.Fatal(err)
	}
	ownerCtx, cancelOwner := context.WithCancel(context.Background())
	defer cancelOwner()
	markerInstalled := make(chan struct{})
	waiterClaimed := make(chan struct{})
	s.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(func() { close(markerInstalled) })
	s.afterWorkspaceStopWaiter = func() { close(waiterClaimed) }

	ownerDone := make(chan error, 1)
	go func() { ownerDone <- s.StopWorkspaceSessions(ownerCtx, "ws-1") }()
	<-markerInstalled
	waiterDone := make(chan error, 1)
	go func() { waiterDone <- s.StopWorkspaceSessions(context.Background(), "ws-1") }()
	<-waiterClaimed
	cancelOwner()
	if err := <-ownerDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("owner error = %v, want context cancellation", err)
	}
	if err := <-waiterDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("waiter error = %v, want owner's cancellation", err)
	}
	s.piSessions.ReleaseAdmission(crossingAdmission)
	admission, err := s.piSessions.Admit("ws-1")
	if err != nil {
		t.Fatalf("cancelled owner did not abort cleanup: %v", err)
	}
	s.piSessions.ReleaseAdmission(admission)
}

func TestStopWorkspaceSessions_CoalescesConcurrentPiStop(t *testing.T) {
	s := newTestHandler(t)
	s.piSessions.Register("owned", nil, &process.Session{}, "", "ws-1", "", false)
	entered := make(chan struct{})
	release := make(chan struct{})
	workspaceClaimed := make(chan struct{})
	calls := 0
	s.stopProcess = func(*process.Session) error { calls++; close(entered); <-release; return nil }
	s.afterWorkspaceClaims = func() { close(workspaceClaimed) }
	stopDone := make(chan error, 1)
	go func() { stopDone <- s.stopRegisteredSession(context.Background(), "owned") }()
	<-entered // The first stop owns the claim and is blocked in process teardown.
	workspaceDone := make(chan error, 1)
	go func() { workspaceDone <- s.StopWorkspaceSessions(context.Background(), "ws-1") }()
	<-workspaceClaimed // Workspace cleanup found the existing claim before it can complete.
	close(release)
	if err := <-stopDone; err != nil {
		t.Fatal(err)
	}
	if err := <-workspaceDone; err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("stop calls = %d, want 1", calls)
	}
}

func TestStopWorkspaceSessions_AbortRetainsFailedCrossingProcessForRetry(t *testing.T) {
	installBlockingFakePiBinary(t)
	s := newTestHandler(t)
	entered := make(chan struct{})
	release := make(chan struct{})
	cleanupMarkerInstalled := make(chan struct{})
	s.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(func() { close(cleanupMarkerInstalled) })
	s.afterProcessStart = func() { close(entered); <-release }
	firstStopFailure := errors.New("stop failed")
	stopCalls := 0
	s.stopProcess = func(proc *process.Session) error {
		stopCalls++
		if stopCalls == 1 {
			return firstStopFailure
		}
		return proc.Close()
	}
	startDone := make(chan error, 1)
	go func() {
		_, err := s.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{SessionID: "crossing", TabID: "tab", WorkspaceID: "ws", CWD: t.TempDir()})
		startDone <- err
	}()
	<-entered
	cleanupDone := make(chan error, 1)
	go func() { cleanupDone <- s.StopWorkspaceSessions(context.Background(), "ws") }()
	<-cleanupMarkerInstalled // Cleanup installed its marker before the crossing start is released.
	s.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(nil)
	close(release)
	assertCrossingCleanupRetries(t, s, startDone, cleanupDone, firstStopFailure, &stopCalls)
}

func assertCrossingCleanupRetries(t *testing.T, s *Service, startDone, cleanupDone <-chan error, stopFailure error, stopCalls *int) {
	t.Helper()
	if err := <-startDone; err == nil {
		t.Fatal("crossing start unexpectedly succeeded")
	}
	if err := <-cleanupDone; !errors.Is(err, stopFailure) {
		t.Fatalf("cleanup error = %v, want %v", err, stopFailure)
	}
	if err := s.StopWorkspaceSessions(context.Background(), "ws"); err != nil {
		t.Fatalf("retry cleanup error = %v", err)
	}
	if *stopCalls != 2 {
		t.Fatalf("stop calls = %d, want retry", *stopCalls)
	}
	if _, exists := s.deps.AgentMgr.Session("crossing"); exists {
		t.Fatal("retry left crossing process active")
	}
}

func TestStopWorkspaceSessions_UsesReplacementGenerationOnly(t *testing.T) {
	s := newTestHandler(t)
	oldProcess := &process.Session{}
	newProcess := &process.Session{}
	s.piSessions.Register("same", nil, oldProcess, "", "ws", "", false)
	oldClaim, _, _ := s.piSessions.ClaimStop("same")
	s.piSessions.Register("same", nil, newProcess, "", "ws", "", false)
	stopped := make([]*process.Session, 0, 1)
	s.stopProcess = func(proc *process.Session) error { stopped = append(stopped, proc); return nil }
	if err := s.StopWorkspaceSessions(context.Background(), "ws"); err != nil {
		t.Fatal(err)
	}
	s.piSessions.CompleteStop(oldClaim, nil)
	if len(stopped) != 1 || stopped[0] != newProcess {
		t.Fatalf("stopped = %#v, want replacement process", stopped)
	}
	if _, exists := s.piSessions.Get("same"); exists {
		t.Fatal("old generation completion affected replacement cleanup")
	}
}
