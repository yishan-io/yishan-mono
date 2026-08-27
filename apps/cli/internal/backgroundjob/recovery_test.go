package backgroundjob

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
)

func TestService_RecoverQueued_CapsConcurrentRunsAndSchedulesAllJobs(t *testing.T) {
	jobs := make([]Job, queuedRecoveryWorkerLimit+2)
	for index := range jobs {
		jobs[index] = testRunnerJob(StatusQueued)
		jobs[index].ID = string(rune('a' + index))
		jobs[index].SessionID = "job-" + jobs[index].ID
	}
	repository := newMemoryRepository(jobs...)
	execution := newRecoveryExecution(queuedRecoveryWorkerLimit)
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	if err := service.RecoverQueued(context.Background()); err != nil {
		t.Fatal(err)
	}
	execution.waitForStarts(t)
	if execution.maxConcurrentStarts() > queuedRecoveryWorkerLimit {
		t.Fatalf("concurrent runs = %d, limit = %d", execution.maxConcurrentStarts(), queuedRecoveryWorkerLimit)
	}
	close(execution.releaseStarts)
	for _, job := range jobs {
		waitForStatus(t, repository, job.ID, StatusSucceeded)
	}
}

type recoveryExecution struct {
	mu            sync.Mutex
	activeStarts  int
	maxStarts     int
	started       chan struct{}
	releaseStarts chan struct{}
	subscriptions map[string]chan dsh.SessionUpdate
}

func newRecoveryExecution(startCount int) *recoveryExecution {
	return &recoveryExecution{
		started:       make(chan struct{}, startCount),
		releaseStarts: make(chan struct{}),
		subscriptions: make(map[string]chan dsh.SessionUpdate),
	}
}

func (e *recoveryExecution) StartSession(_ context.Context, request dsh.SessionStartRequest) (dsh.SessionStartResult, error) {
	e.mu.Lock()
	e.activeStarts++
	if e.activeStarts > e.maxStarts {
		e.maxStarts = e.activeStarts
	}
	e.mu.Unlock()
	e.started <- struct{}{}
	<-e.releaseStarts
	e.mu.Lock()
	e.activeStarts--
	e.mu.Unlock()
	return dsh.SessionStartResult{}, nil
}

func (e *recoveryExecution) PromptSession(_ context.Context, request dsh.SessionPromptRequest) (dsh.SessionPromptResult, error) {
	e.mu.Lock()
	updates := e.subscriptions[request.SessionID]
	e.mu.Unlock()
	updates <- dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}}
	updates <- dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}}
	return dsh.SessionPromptResult{}, nil
}

func (e *recoveryExecution) CancelSession(context.Context, dsh.SessionCancelRequest) (dsh.SessionCancelResult, error) {
	return dsh.SessionCancelResult{}, nil
}
func (e *recoveryExecution) FlushSession(context.Context, dsh.SessionFlushRequest) (dsh.DurableCursor, error) {
	return dsh.DurableCursor{}, nil
}
func (e *recoveryExecution) ReadSession(context.Context, dsh.SessionReadRequest) (dsh.SessionReadResult, error) {
	return dsh.SessionReadResult{}, nil
}
func (e *recoveryExecution) DisposeSession(context.Context, dsh.SessionReadRequest) (dsh.SessionDisposeResult, error) {
	return dsh.SessionDisposeResult{}, nil
}
func (e *recoveryExecution) SubscribeSession(_ context.Context, request dsh.SessionSubscribeRequest) (dsh.SessionSubscription, error) {
	e.mu.Lock()
	updates := make(chan dsh.SessionUpdate, 2)
	e.subscriptions[request.SessionID] = updates
	e.mu.Unlock()
	return dsh.SessionSubscription{Updates: updates, Unsubscribe: func() {}}, nil
}
func (e *recoveryExecution) waitForStarts(t *testing.T) {
	t.Helper()
	for range queuedRecoveryWorkerLimit {
		<-e.started
	}
}
func (e *recoveryExecution) maxConcurrentStarts() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.maxStarts
}

func TestService_Close_WaitsForCancelledQueuedRecovery(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	repository.recoveryStarted = make(chan struct{})
	recoveryRelease := make(chan struct{})
	repository.recoveryRelease = recoveryRelease
	repository.recoveryCancelled = make(chan struct{})
	service := NewService(repository, testWorkspaceResolver{}, &fakeExecution{}, "node", nil)

	recoveryDone := make(chan error, 1)
	go func() { recoveryDone <- service.RecoverQueued(context.Background()) }()
	<-repository.recoveryStarted
	closeDone := make(chan error, 1)
	go func() { closeDone <- service.Close(context.Background()) }()
	select {
	case <-repository.recoveryCancelled:
	case <-time.After(time.Second):
		t.Fatal("Close did not cancel queued recovery")
	}
	select {
	case err := <-closeDone:
		t.Fatalf("Close returned before queued recovery stopped: %v", err)
	case <-time.After(20 * time.Millisecond):
	}
	close(recoveryRelease)
	if err := <-recoveryDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("recovery error = %v", err)
	}
	if err := <-closeDone; err != nil {
		t.Fatal(err)
	}
}
