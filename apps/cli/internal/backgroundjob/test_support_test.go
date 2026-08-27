package backgroundjob

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/workspace"
)

func testRunnerJob(status Status) Job {
	return Job{ID: "id", Kind: KindWorkspaceTaskRun, Runtime: RuntimeDSH, WorkspaceID: "workspace", ProjectID: "project", OrganizationID: "org", OwnerNodeID: "node", SessionID: "job-id", CWD: "/workspace", Prompt: "do work", Model: "model", Status: status}
}

type testWorkspaceResolver struct{}

func (testWorkspaceResolver) GetWorkspace(string) (workspace.Workspace, error) {
	return workspace.Workspace{ID: "workspace", Path: "/workspace", ProjectID: "project", OrgID: "org"}, nil
}

type memoryRepository struct {
	mu                sync.Mutex
	jobs              map[string]Job
	getStarted        chan struct{}
	getRelease        <-chan struct{}
	recoveryStarted   chan struct{}
	recoveryRelease   <-chan struct{}
	recoveryCancelled chan struct{}
	listStarted       chan struct{}
	listRelease       <-chan struct{}
	terminalErr       error
}

func newMemoryRepository(jobs ...Job) *memoryRepository {
	entries := map[string]Job{}
	for _, job := range jobs {
		entries[job.ID] = job
	}
	return &memoryRepository{jobs: entries}
}
func (r *memoryRepository) Create(context.Context, Job) (Job, error) { panic("unused") }
func (r *memoryRepository) Get(ctx context.Context, id string) (Job, error) {
	if r.getStarted != nil {
		close(r.getStarted)
		select {
		case <-r.getRelease:
		case <-ctx.Done():
			return Job{}, ctx.Err()
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	job, ok := r.jobs[id]
	if !ok {
		return Job{}, ErrJobNotFound
	}
	return job, nil
}
func (r *memoryRepository) ListByWorkspace(_ context.Context, workspaceID string) ([]Job, error) {
	if r.listStarted != nil {
		close(r.listStarted)
		<-r.listRelease
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	var jobs []Job
	for _, job := range r.jobs {
		if job.WorkspaceID == workspaceID {
			jobs = append(jobs, job)
		}
	}
	return jobs, nil
}
func (r *memoryRepository) CompareAndSwapStatus(_ context.Context, id string, from, to Status, outcome Outcome) (Job, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	job, ok := r.jobs[id]
	if !ok || job.Status != from {
		return Job{}, false, nil
	}
	if from == StatusRunning && r.terminalErr != nil {
		return Job{}, false, r.terminalErr
	}
	job.Status = to
	job.ResultText = outcome.ResultText
	job.ErrorCode = outcome.ErrorCode
	job.ErrorMessage = outcome.ErrorMessage
	r.jobs[id] = job
	return job, true, nil
}
func (r *memoryRepository) ListForStartupRecovery(ctx context.Context) ([]Job, error) {
	if r.recoveryStarted != nil {
		close(r.recoveryStarted)
		select {
		case <-r.recoveryRelease:
		case <-ctx.Done():
			if r.recoveryCancelled != nil {
				close(r.recoveryCancelled)
				<-r.recoveryRelease
			}
			return nil, ctx.Err()
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	var jobs []Job
	for _, job := range r.jobs {
		if job.Status == StatusQueued || job.Status == StatusRunning {
			jobs = append(jobs, job)
		}
	}
	return jobs, nil
}

type fakeExecution struct {
	mu                                              sync.Mutex
	started, prompted, cancelled, flushed, disposed int
	transcript                                      []json.RawMessage
	subscribeErr, readErr, cancelErr, disposeErr    error
	promptStarted                                   chan struct{}
	promptRelease                                   <-chan struct{}
	disposeRelease                                  <-chan struct{}
	terminalRelease                                 <-chan struct{}
	initialIdle                                     chan struct{}
	runningRelease                                  <-chan struct{}
	updates                                         chan dsh.SessionUpdate
}

func (f *fakeExecution) StartSession(context.Context, dsh.SessionStartRequest) (dsh.SessionStartResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.started++
	return dsh.SessionStartResult{}, nil
}
func (f *fakeExecution) PromptSession(ctx context.Context, _ dsh.SessionPromptRequest) (dsh.SessionPromptResult, error) {
	f.mu.Lock()
	f.prompted++
	started, release, terminalRelease, updates := f.promptStarted, f.promptRelease, f.terminalRelease, f.updates
	f.mu.Unlock()
	if started != nil {
		close(started)
	}
	if release != nil {
		select {
		case <-release:
		case <-ctx.Done():
			return dsh.SessionPromptResult{}, ctx.Err()
		}
	}
	if f.initialIdle != nil {
		updates <- dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}}
		close(f.initialIdle)
		select {
		case <-f.runningRelease:
		case <-ctx.Done():
			return dsh.SessionPromptResult{}, ctx.Err()
		}
	}
	updates <- dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}}
	if terminalRelease == nil {
		updates <- dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}}
		return dsh.SessionPromptResult{}, nil
	}
	go func() {
		<-terminalRelease
		updates <- dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}}
	}()
	return dsh.SessionPromptResult{}, nil
}
func (f *fakeExecution) CancelSession(ctx context.Context, _ dsh.SessionCancelRequest) (dsh.SessionCancelResult, error) {
	f.mu.Lock()
	f.cancelled++
	err := f.cancelErr
	f.mu.Unlock()
	if err != nil {
		<-ctx.Done()
		return dsh.SessionCancelResult{}, ctx.Err()
	}
	return dsh.SessionCancelResult{}, nil
}
func (f *fakeExecution) FlushSession(context.Context, dsh.SessionFlushRequest) (dsh.DurableCursor, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.flushed++
	return dsh.DurableCursor{}, nil
}
func (f *fakeExecution) ReadSession(context.Context, dsh.SessionReadRequest) (dsh.SessionReadResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return dsh.SessionReadResult{Events: f.transcript}, f.readErr
}
func (f *fakeExecution) DisposeSession(ctx context.Context, _ dsh.SessionReadRequest) (dsh.SessionDisposeResult, error) {
	f.mu.Lock()
	f.disposed++
	release, err := f.disposeRelease, f.disposeErr
	f.mu.Unlock()
	if release != nil {
		select {
		case <-release:
		case <-ctx.Done():
			return dsh.SessionDisposeResult{}, ctx.Err()
		}
	}
	return dsh.SessionDisposeResult{}, err
}
func (f *fakeExecution) SubscribeSession(context.Context, dsh.SessionSubscribeRequest) (dsh.SessionSubscription, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.subscribeErr != nil {
		return dsh.SessionSubscription{}, f.subscribeErr
	}
	if f.updates == nil {
		f.updates = make(chan dsh.SessionUpdate, 8)
	}
	return dsh.SessionSubscription{Updates: f.updates, Unsubscribe: func() {}}, nil
}
func (f *fakeExecution) counts() (int, int, int, int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.started, f.prompted, f.cancelled, f.disposed
}

func waitForStatus(t *testing.T, r *memoryRepository, id string, want Status) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		job, _ := r.Get(context.Background(), id)
		if job.Status == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("job %s did not become %s", id, want)
}
