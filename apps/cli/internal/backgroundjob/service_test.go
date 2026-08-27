package backgroundjob

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
)

func TestService_Run_SucceedsWithoutFrontendProducts(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	execution := &fakeExecution{transcript: []json.RawMessage{[]byte(`{"type":"assistant","text":"done"}`)}}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	service.Run(context.Background(), "id")
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusSucceeded || job.ResultText != "done" {
		t.Fatalf("job = %#v", job)
	}
	if execution.started != 1 || execution.prompted != 1 || execution.disposed != 1 {
		t.Fatalf("execution = %#v", execution)
	}
}

func TestService_Run_RuntimeLossMarksInterrupted(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	execution := &fakeExecution{subscribeErr: dsh.ErrRuntimeUnavailable}
	NewService(repository, testWorkspaceResolver{}, execution, "node", nil).Run(context.Background(), "id")
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusInterrupted || job.ErrorCode != failureCodeRuntime {
		t.Fatalf("job = %#v", job)
	}
}

func TestService_Run_RuntimeLossPreservesOriginalErrorWhenDisposeFails(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	runtimeLost := fmt.Errorf("DSH_RUNTIME_LOST: %w", dsh.ErrRuntimeUnavailable)
	execution := &fakeExecution{subscribeErr: runtimeLost, disposeErr: errors.New("dispose failed")}
	NewService(repository, testWorkspaceResolver{}, execution, "node", nil).Run(context.Background(), "id")
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusInterrupted || job.ErrorCode != "DSH_RUNTIME_LOST" || job.ErrorMessage != runtimeLost.Error() {
		t.Fatalf("job = %#v", job)
	}
}

func TestService_Cancel_QueuedAndRunning(t *testing.T) {
	for _, status := range []Status{StatusQueued, StatusRunning} {
		t.Run(string(status), func(t *testing.T) {
			repository := newMemoryRepository(testRunnerJob(status))
			execution := &fakeExecution{}
			NewService(repository, testWorkspaceResolver{}, execution, "node", nil).Cancel(context.Background(), "id")
			job, _ := repository.Get(context.Background(), "id")
			if job.Status != StatusCancelled {
				t.Fatalf("status = %s", job.Status)
			}
			if status == StatusRunning && (execution.cancelled != 1 || execution.flushed != 1 || execution.disposed != 1) {
				t.Fatalf("running cancel = %#v", execution)
			}
		})
	}
}

func TestService_CancelWorkspace_OnlyLocalActiveJobs(t *testing.T) {
	local := testRunnerJob(StatusRunning)
	foreign := testRunnerJob(StatusRunning)
	foreign.ID, foreign.SessionID, foreign.OwnerNodeID = "foreign", "job-foreign", "other"
	repository := newMemoryRepository(local, foreign)
	execution := &fakeExecution{}
	NewService(repository, testWorkspaceResolver{}, execution, "node", nil).CancelWorkspace(context.Background(), "workspace")
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusCancelled {
		t.Fatalf("local = %s", job.Status)
	}
	job, _ = repository.Get(context.Background(), "foreign")
	if job.Status != StatusRunning {
		t.Fatalf("foreign = %s", job.Status)
	}
}

func TestService_RecoverRunning_InterruptsRunningWithoutSchedulingQueued(t *testing.T) {
	queued, running := testRunnerJob(StatusQueued), testRunnerJob(StatusRunning)
	running.ID, running.SessionID = "running", "job-running"
	repository := newMemoryRepository(queued, running)
	execution := &fakeExecution{transcript: []json.RawMessage{[]byte(`{"text":"ok"}`)}}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	if err := service.RecoverRunning(context.Background()); err != nil {
		t.Fatal(err)
	}
	queuedJob, _ := repository.Get(context.Background(), "id")
	runningJob, _ := repository.Get(context.Background(), "running")
	if queuedJob.Status != StatusQueued || runningJob.Status != StatusInterrupted || execution.started != 0 {
		t.Fatalf("queued = %#v, running = %#v, starts = %d", queuedJob, runningJob, execution.started)
	}
}

func TestService_RecoverQueued_SchedulesQueuedJobOnce(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	execution := &fakeExecution{transcript: []json.RawMessage{[]byte(`{"text":"ok"}`)}}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	if err := service.RecoverQueued(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := service.RecoverQueued(context.Background()); err != nil {
		t.Fatal(err)
	}
	waitForStatus(t, repository, "id", StatusSucceeded)
	if execution.started != 1 {
		t.Fatalf("starts = %d", execution.started)
	}
}

func TestService_Run_WaitsForTerminalIdleBeforeDispose(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	release := make(chan struct{})
	execution := &fakeExecution{promptStarted: make(chan struct{}), terminalRelease: release, transcript: []json.RawMessage{[]byte(`{"text":"final"}`)}}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	done := make(chan struct{})
	go func() { service.Run(context.Background(), "id"); close(done) }()
	<-execution.promptStarted
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusRunning {
		t.Fatalf("status before terminal idle = %s", job.Status)
	}
	_, _, _, disposed := execution.counts()
	if disposed != 0 {
		t.Fatalf("disposed before terminal idle = %d", disposed)
	}
	close(release)
	<-done
	job, _ = repository.Get(context.Background(), "id")
	if job.Status != StatusSucceeded || job.ResultText != "final" {
		t.Fatalf("job = %#v", job)
	}
}

func TestService_CancelWorkspace_BlocksAdmissionAndWaitsForRunningJob(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	release := make(chan struct{})
	execution := &fakeExecution{promptStarted: make(chan struct{}), promptRelease: release}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	done := make(chan struct{})
	go func() { service.Run(context.Background(), "id"); close(done) }()
	<-execution.promptStarted
	if err := service.CancelWorkspace(context.Background(), "workspace"); err != nil {
		t.Fatal(err)
	}
	<-done
	service.Run(context.Background(), "id")
	job, _ := repository.Get(context.Background(), "id")
	started, _, cancelled, disposed := execution.counts()
	if job.Status != StatusCancelled || started != 1 || cancelled != 1 || disposed != 1 {
		t.Fatalf("job = %#v, execution = %d/%d/%d", job, started, cancelled, disposed)
	}
}

func TestService_Close_CancelsAndWaitsForRunningJob(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	execution := &fakeExecution{promptStarted: make(chan struct{}), promptRelease: make(chan struct{})}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	go service.Run(context.Background(), "id")
	<-execution.promptStarted
	if err := service.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusCancelled {
		t.Fatalf("status = %s", job.Status)
	}
}

func TestService_Run_PersistsFailure(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	execution := &fakeExecution{readErr: errors.New("durable transcript failed")}
	NewService(repository, testWorkspaceResolver{}, execution, "node", nil).Run(context.Background(), "id")
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusFailed || job.ErrorMessage != "durable transcript failed" {
		t.Fatalf("job = %#v", job)
	}
}

func TestService_CancelWorkspace_TimesOutWhileCleanupIsBlocked(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	execution := &fakeExecution{promptStarted: make(chan struct{}), promptRelease: make(chan struct{}), cancelErr: errors.New("block")}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	service.cleanupTimeout = 20 * time.Millisecond
	go service.Run(context.Background(), "id")
	<-execution.promptStarted
	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	if err := service.CancelWorkspace(ctx, "workspace"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("cancel workspace error = %v", err)
	}
	waitForStatus(t, repository, "id", StatusFailed)
}

func TestService_CancelWorkspace_AbortRestoresAdmission(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	service := NewService(repository, testWorkspaceResolver{}, &fakeExecution{}, "node", nil)
	if err := service.CancelWorkspace(context.Background(), "workspace"); err != nil {
		t.Fatal(err)
	}
	service.AbortWorkspaceClose("workspace")
	job := testRunnerJob(StatusQueued)
	job.ID, job.SessionID = "retry", "job-retry"
	repository.mu.Lock()
	repository.jobs[job.ID] = job
	repository.mu.Unlock()
	service.Run(context.Background(), job.ID)
	job, _ = repository.Get(context.Background(), job.ID)
	if job.Status != StatusSucceeded {
		t.Fatalf("status after aborted close = %s", job.Status)
	}
}

func TestService_Run_ServiceShutdownKeepsQueuedJobForRecovery(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	repository.getStarted = make(chan struct{})
	release := make(chan struct{})
	repository.getRelease = release
	service := NewService(repository, testWorkspaceResolver{}, &fakeExecution{}, "node", nil)
	runDone := make(chan struct{})
	go func() { service.Run(context.Background(), "id"); close(runDone) }()
	<-repository.getStarted
	closeDone := make(chan error, 1)
	go func() { closeDone <- service.Close(context.Background()) }()
	<-service.ctx.Done()
	select {
	case <-runDone:
	case <-time.After(time.Second):
		t.Fatal("Close did not interrupt blocked repository lookup")
	}
	close(release)
	if err := <-closeDone; err != nil {
		t.Fatal(err)
	}
	repository.getStarted = nil
	repository.getRelease = nil
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusQueued {
		t.Fatalf("queued job during shutdown = %s", job.Status)
	}
}

func TestService_RecoverQueued_ServiceShutdownInterruptsBlockedRepositoryLookup(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	repository.recoveryStarted = make(chan struct{})
	repository.recoveryRelease = make(chan struct{})
	service := NewService(repository, testWorkspaceResolver{}, &fakeExecution{}, "node", nil)
	recovered := make(chan error, 1)
	go func() { recovered <- service.RecoverQueued(context.Background()) }()
	<-repository.recoveryStarted
	if err := service.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-recovered:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("recovery error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Close did not interrupt blocked recovery lookup")
	}
}

func TestService_Run_InitialIdleDoesNotComplete(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	runningRelease := make(chan struct{})
	execution := &fakeExecution{
		initialIdle:    make(chan struct{}),
		runningRelease: runningRelease,
	}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	done := make(chan struct{})
	go func() { service.Run(context.Background(), "id"); close(done) }()
	<-execution.initialIdle
	job, _ := repository.Get(context.Background(), "id")
	_, _, _, disposed := execution.counts()
	if job.Status != StatusRunning || disposed != 0 {
		t.Fatalf("initial idle completed job: status=%s disposed=%d", job.Status, disposed)
	}
	close(runningRelease)
	<-done
	job, _ = repository.Get(context.Background(), "id")
	_, _, _, disposed = execution.counts()
	if job.Status != StatusSucceeded || disposed != 1 {
		t.Fatalf("terminal idle after running = %#v", job)
	}
}

func TestService_Run_BoundedFailureDisposePersistsTerminalState(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	execution := &fakeExecution{subscribeErr: errors.New("session failed"), disposeRelease: make(chan struct{})}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	service.cleanupTimeout = 20 * time.Millisecond
	done := make(chan struct{})
	go func() { service.Run(context.Background(), "id"); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("blocked DSH dispose did not time out")
	}
	if err := service.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusFailed || !strings.Contains(job.ErrorMessage, context.DeadlineExceeded.Error()) {
		t.Fatalf("job = %#v", job)
	}
}

func TestService_Close_RetriesTerminalPersistenceBeforeReportingQuiesced(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	repository.terminalErr = errors.New("sqlite temporarily unavailable")
	service := NewService(repository, testWorkspaceResolver{}, &fakeExecution{readErr: errors.New("execution failed")}, "node", nil)
	service.Run(context.Background(), "id")
	if err := service.Close(context.Background()); !errors.Is(err, repository.terminalErr) {
		t.Fatalf("first close error = %v", err)
	}
	repository.mu.Lock()
	repository.terminalErr = nil
	repository.mu.Unlock()
	if err := service.Close(context.Background()); err != nil {
		t.Fatalf("retry close error = %v", err)
	}
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusFailed {
		t.Fatalf("job still running after close retry: %#v", job)
	}
}
