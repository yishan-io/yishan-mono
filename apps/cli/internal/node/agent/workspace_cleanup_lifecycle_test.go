package agent

import (
	"context"
	"errors"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/agent/session"
)

func TestBeginWorkspaceAgentCleanup_CoalescesWithStopWorkspaceSessions(t *testing.T) {
	s := newTestHandler(t)
	s.piSessions.Register("owned", nil, &process.Session{}, "", "ws", "", false)
	claimsReady := make(chan struct{})
	joinerEntered := make(chan struct{})
	allowStop := make(chan struct{})
	s.afterWorkspaceClaims = func() { close(claimsReady) }
	s.afterWorkspaceStopWaiter = func() { close(joinerEntered) }
	s.stopProcess = func(*process.Session) error { <-allowStop; return nil }

	ownerResult := make(chan struct {
		handle *WorkspaceAgentCleanup
		err    error
	}, 1)
	go func() {
		handle, err := s.BeginWorkspaceAgentCleanup(context.Background(), "ws")
		ownerResult <- struct {
			handle *WorkspaceAgentCleanup
			err    error
		}{handle, err}
	}()
	<-claimsReady
	joinerDone := make(chan error, 1)
	go func() { joinerDone <- s.StopWorkspaceSessions(context.Background(), "ws") }()
	<-joinerEntered
	select {
	case err := <-joinerDone:
		t.Fatalf("joiner returned before direct owner finalized: %v", err)
	default:
	}

	close(allowStop)
	assertDirectCleanupCompletes(t, s, ownerResult, joinerDone)
}

func assertDirectCleanupCompletes(t *testing.T, s *Service, ownerResult <-chan struct {
	handle *WorkspaceAgentCleanup
	err    error
}, joinerDone <-chan error) {
	t.Helper()
	owner := <-ownerResult
	if owner.err != nil || !owner.handle.IsOwner() {
		t.Fatalf("direct cleanup = (%#v, %v), want owner success", owner.handle, owner.err)
	}
	s.CommitWorkspaceAgentCleanup(owner.handle)
	if err := <-joinerDone; err != nil {
		t.Fatalf("StopWorkspaceSessions join error = %v", err)
	}
}

func TestWorkspaceAgentCleanup_StaleAbortDoesNotReopenReplacementAttempt(t *testing.T) {
	s := newTestHandler(t)
	first, err := s.BeginWorkspaceAgentCleanup(context.Background(), "ws")
	if err != nil {
		t.Fatal(err)
	}
	s.AbortWorkspaceAgentCleanup(first)
	second, err := s.BeginWorkspaceAgentCleanup(context.Background(), "ws")
	if err != nil {
		t.Fatal(err)
	}
	s.AbortWorkspaceAgentCleanup(first)
	if _, admissionErr := s.piSessions.Admit("ws"); !errors.Is(admissionErr, session.ErrWorkspaceClosing) {
		t.Fatalf("stale abort reopened replacement cleanup: %v", admissionErr)
	}
	s.AbortWorkspaceAgentCleanup(second)
	admission, admissionErr := s.piSessions.Admit("ws")
	if admissionErr != nil {
		t.Fatalf("current cleanup abort did not reopen workspace: %v", admissionErr)
	}
	s.piSessions.ReleaseAdmission(admission)
}

func TestBeginWorkspaceAgentCleanup_JoinerReceivesAbortSentinel(t *testing.T) {
	s := newTestHandler(t)
	owner, err := s.BeginWorkspaceAgentCleanup(context.Background(), "ws")
	if err != nil || !owner.IsOwner() {
		t.Fatalf("owner cleanup = (%#v, %v), want successful owner", owner, err)
	}

	joinerWaiting := make(chan struct{})
	s.afterWorkspaceStopWaiter = func() { close(joinerWaiting) }
	joinerDone := make(chan error, 1)
	go func() {
		_, joinErr := s.BeginWorkspaceAgentCleanup(context.Background(), "ws")
		joinerDone <- joinErr
	}()
	<-joinerWaiting
	s.AbortWorkspaceAgentCleanup(owner)
	if joinErr := <-joinerDone; !errors.Is(joinErr, ErrWorkspaceCleanupAborted) {
		t.Fatalf("joiner error = %v, want ErrWorkspaceCleanupAborted", joinErr)
	}
}

func TestStopWorkspaceSessions_JoinerRetriesAbortedDirectCleanup(t *testing.T) {
	s := newTestHandler(t)
	owner, err := s.BeginWorkspaceAgentCleanup(context.Background(), "ws")
	if err != nil || !owner.IsOwner() {
		t.Fatalf("owner cleanup = (%#v, %v), want successful owner", owner, err)
	}

	joinerWaiting := make(chan struct{})
	s.afterWorkspaceStopWaiter = func() { close(joinerWaiting) }
	joinerDone := make(chan error, 1)
	go func() { joinerDone <- s.StopWorkspaceSessions(context.Background(), "ws") }()
	<-joinerWaiting
	s.AbortWorkspaceAgentCleanup(owner)
	if joinErr := <-joinerDone; joinErr != nil {
		t.Fatalf("joining stop error = %v, want nil", joinErr)
	}
	if _, admissionErr := s.piSessions.Admit("ws"); !errors.Is(admissionErr, session.ErrWorkspaceClosing) {
		t.Fatalf("joining stop did not commit replacement cleanup: %v", admissionErr)
	}
}

func TestWorkspaceAgentCleanup_ConcurrentFinishPublishesWinningOutcome(t *testing.T) {
	s := newTestHandler(t)
	handle, err := s.BeginWorkspaceAgentCleanup(context.Background(), "ws")
	if err != nil || !handle.IsOwner() {
		t.Fatalf("owner cleanup = (%#v, %v), want successful owner", handle, err)
	}
	joinerDone := make(chan error, 1)
	go func() { _, joinErr := s.BeginWorkspaceAgentCleanup(context.Background(), "ws"); joinerDone <- joinErr }()
	go s.AbortWorkspaceAgentCleanup(handle)
	go s.CommitWorkspaceAgentCleanup(handle)
	joinErr := <-joinerDone
	admission, admissionErr := s.piSessions.Admit("ws")
	if errors.Is(joinErr, ErrWorkspaceCleanupAborted) != (admissionErr == nil) {
		t.Fatalf("outcome and registry state diverged: join=%v admission=%v", joinErr, admissionErr)
	}
	if admissionErr == nil {
		s.piSessions.ReleaseAdmission(admission)
	}
}

func TestWorkspaceAgentCleanup_RepeatsCommittedOutcome(t *testing.T) {
	s := newTestHandler(t)
	owner, err := s.BeginWorkspaceAgentCleanup(context.Background(), "ws")
	if err != nil || !owner.IsOwner() {
		t.Fatalf("initial cleanup = (%#v, %v), want owner success", owner, err)
	}
	s.CommitWorkspaceAgentCleanup(owner)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	repeat, err := s.BeginWorkspaceAgentCleanup(ctx, "ws")
	if err != nil || repeat.IsOwner() {
		t.Fatalf("repeated cleanup = (%#v, %v), want completed joiner", repeat, err)
	}
	if err := s.StopWorkspaceSessions(context.Background(), "ws"); err != nil {
		t.Fatalf("repeated stop = %v, want committed outcome", err)
	}
}
