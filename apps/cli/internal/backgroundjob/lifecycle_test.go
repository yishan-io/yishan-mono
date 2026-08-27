package backgroundjob

import (
	"context"
	"errors"
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

type queuedCancelRaceRepository struct {
	*memoryRepository
	once sync.Once
}

func (r *queuedCancelRaceRepository) CompareAndSwapStatus(ctx context.Context, id string, from, to Status, outcome Outcome) (Job, bool, error) {
	if from == StatusQueued && to == StatusCancelled {
		r.once.Do(func() {
			r.mu.Lock()
			job := r.jobs[id]
			job.Status = StatusRunning
			r.jobs[id] = job
			r.mu.Unlock()
		})
	}
	return r.memoryRepository.CompareAndSwapStatus(ctx, id, from, to, outcome)
}

func TestService_Cancel_QueuedClaimRaceStopsRunningJob(t *testing.T) {
	repository := &queuedCancelRaceRepository{memoryRepository: newMemoryRepository(testRunnerJob(StatusQueued))}
	execution := &fakeExecution{}
	service := NewService(repository, testWorkspaceResolver{}, execution, "node", nil)
	if err := service.Cancel(context.Background(), "id"); err != nil {
		t.Fatal(err)
	}
	job, _ := repository.Get(context.Background(), "id")
	if job.Status != StatusCancelled || execution.cancelled != 1 {
		t.Fatalf("job = %#v, cancelled = %d", job, execution.cancelled)
	}
}

func TestService_CreateAndCancelWorkspace_CancelsJobAdmittedBeforeClose(t *testing.T) {
	repository := newMemoryRepository()
	repository.createStarted = make(chan struct{})
	createRelease := make(chan struct{})
	repository.createRelease = createRelease
	service := NewService(repository, testWorkspaceResolver{}, &fakeExecution{}, "node", nil)
	job := testRunnerJob(StatusQueued)
	created := make(chan error, 1)
	go func() { _, err := service.Create(context.Background(), job); created <- err }()
	<-repository.createStarted
	closed := make(chan error, 1)
	go func() { closed <- service.CancelWorkspace(context.Background(), job.WorkspaceID) }()
	close(createRelease)
	if err := <-created; err != nil {
		t.Fatal(err)
	}
	if err := <-closed; err != nil {
		t.Fatal(err)
	}
	persisted, _ := service.Get(context.Background(), job.ID)
	if persisted.Status != StatusCancelled {
		t.Fatalf("job status = %s, want cancelled", persisted.Status)
	}
}

func TestService_CreateRejectsWorkspaceAfterCloseAdmissionBegins(t *testing.T) {
	repository := newMemoryRepository()
	repository.listStarted = make(chan struct{})
	listRelease := make(chan struct{})
	repository.listRelease = listRelease
	service := NewService(repository, testWorkspaceResolver{}, &fakeExecution{}, "node", nil)
	closeDone := make(chan error, 1)
	go func() { closeDone <- service.CancelWorkspace(context.Background(), "workspace") }()
	<-repository.listStarted
	if _, err := service.Create(context.Background(), testRunnerJob(StatusQueued)); !errors.Is(err, errWorkspaceClosing) {
		t.Fatalf("create error = %v", err)
	}
	close(listRelease)
	if err := <-closeDone; err != nil {
		t.Fatal(err)
	}
}
