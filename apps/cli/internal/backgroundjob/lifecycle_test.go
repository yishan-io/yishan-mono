package backgroundjob

import (
	"context"
	"sync"
	"testing"
	"time"
)

type serviceCleanup struct {
	name  string
	close func(*Service) error
}

func TestService_Run_DuplicateAdmissionKeepsLiveLeaseForCleanup(t *testing.T) {
	for _, cleanup := range []serviceCleanup{
		{name: "cancel workspace", close: func(service *Service) error {
			return service.CancelWorkspace(context.Background(), "workspace")
		}},
		{name: "close", close: func(service *Service) error {
			return service.Close(context.Background())
		}},
	} {
		t.Run(cleanup.name, func(t *testing.T) {
			testDuplicateAdmissionCleanup(t, cleanup.close)
		})
	}
}

func testDuplicateAdmissionCleanup(t *testing.T, cleanup func(*Service) error) {
	t.Helper()
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	disposeRelease := make(chan struct{})
	var releaseOnce sync.Once
	releaseDispose := func() { releaseOnce.Do(func() { close(disposeRelease) }) }
	defer releaseDispose()
	execution := &fakeExecution{promptStarted: make(chan struct{}), promptRelease: make(chan struct{}), disposeRelease: disposeRelease}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	runDone := make(chan struct{})
	go func() { service.Run(context.Background(), "id"); close(runDone) }()
	<-execution.promptStarted
	service.Run(context.Background(), "id")
	cleanupDone := make(chan error, 1)
	go func() { cleanupDone <- cleanup(service) }()
	waitForDispose(t, execution)
	assertCleanupWaits(t, cleanupDone)
	releaseDispose()
	waitForRunAndCleanup(t, runDone, cleanupDone)
	assertSingleRunnerCleanup(t, repository, execution)
}

func waitForDispose(t *testing.T, execution *fakeExecution) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		_, _, _, disposed := execution.counts()
		if disposed > 0 {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("runner did not start DSH disposal")
}

func assertCleanupWaits(t *testing.T, cleanupDone <-chan error) {
	t.Helper()
	select {
	case err := <-cleanupDone:
		t.Fatalf("cleanup returned before runner disposal completed: %v", err)
	default:
	}
}

func waitForRunAndCleanup(t *testing.T, runDone <-chan struct{}, cleanupDone <-chan error) {
	t.Helper()
	select {
	case <-runDone:
	case <-time.After(time.Second):
		t.Fatal("runner did not finish")
	}
	select {
	case err := <-cleanupDone:
		if err != nil {
			t.Fatalf("cleanup error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("cleanup did not finish")
	}
}

func assertSingleRunnerCleanup(t *testing.T, repository *memoryRepository, execution *fakeExecution) {
	t.Helper()
	job, _ := repository.Get(context.Background(), "id")
	started, _, cancelled, disposed := execution.counts()
	if job.Status != StatusCancelled || started != 1 || cancelled != 1 || disposed != 1 {
		t.Fatalf("job = %#v, execution = started:%d cancelled:%d disposed:%d", job, started, cancelled, disposed)
	}
}

func TestService_Run_WorkspaceCloseWinsAdmissionRaceAndCancelsQueuedJob(t *testing.T) {
	repository := newMemoryRepository(testRunnerJob(StatusQueued))
	repository.getStarted = make(chan struct{})
	getRelease := make(chan struct{})
	repository.getRelease = getRelease
	repository.listStarted = make(chan struct{})
	listRelease := make(chan struct{})
	repository.listRelease = listRelease
	service := NewService(repository, testWorkspaceResolver{}, &fakeExecution{}, "node", nil)

	runDone := make(chan struct{})
	go func() { service.Run(context.Background(), "id"); close(runDone) }()
	<-repository.getStarted
	cancelDone := make(chan error, 1)
	go func() { cancelDone <- service.CancelWorkspace(context.Background(), "workspace") }()
	<-repository.listStarted
	close(getRelease)
	select {
	case <-runDone:
	case <-time.After(time.Second):
		t.Fatal("run did not lose workspace admission")
	}
	repository.getStarted = nil
	repository.getRelease = nil
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusQueued {
		t.Fatalf("job before close sweep = %s, want queued", job.Status)
	}
	close(listRelease)
	if err := <-cancelDone; err != nil {
		t.Fatal(err)
	}
	job, _ = repository.Get(context.Background(), "id")
	if job.Status != StatusCancelled {
		t.Fatalf("job after close sweep = %s, want cancelled", job.Status)
	}
}
