package application

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

type retryInstances struct {
	workspace     workspace.Workspace
	isRuntimeOpen bool
	removeErr     error
	setStateErr   map[instance.State]error
	watchErr      error
	calls         []string
}

func (f *retryInstances) CreateWorkspaceWithProgress(context.Context, workspace.CreateRequest, workspace.CreateProgressReporter) (workspace.Workspace, error) {
	return f.workspace, nil
}
func (f *retryInstances) StopWorkspaceTerminals(string) []string {
	f.calls = append(f.calls, "terminals")
	return nil
}
func (f *retryInstances) CloseWorkspace(context.Context, workspace.CloseRequest) (workspace.CloseResult, error) {
	return workspace.CloseResult{}, nil
}
func (f *retryInstances) CloseWorkspacePath(_ context.Context, _ workspace.ClosePathRequest) (workspace.CloseResult, error) {
	f.calls = append(f.calls, "remove")
	if f.removeErr != nil {
		return workspace.CloseResult{}, f.removeErr
	}
	return workspace.CloseResult{WorktreeRemoved: true}, nil
}
func (f *retryInstances) SetState(_ string, state instance.State, _ instance.Health) error {
	f.calls = append(f.calls, string(state))
	return f.setStateErr[state]
}
func (f *retryInstances) Get(string) (workspace.Workspace, error) {
	if !f.isRuntimeOpen {
		return workspace.Workspace{}, errors.New("not open")
	}
	return f.workspace, nil
}
func (f *retryInstances) RemoveFromMemory(string) { f.calls = append(f.calls, "memory") }
func (f *retryInstances) WatchAndTrack(workspace.Workspace) error {
	f.calls = append(f.calls, "watch")
	return f.watchErr
}
func (f *retryInstances) Unwatch(string)      { f.calls = append(f.calls, "unwatch") }
func (f *retryInstances) StopTracking(string) { f.calls = append(f.calls, "tracking") }

type retryRecords struct {
	closed      int
	didFinalize bool
	finalizeErr error
}

func (*retryRecords) CreateRemoteRecord(context.Context, Registration)                            {}
func (*retryRecords) UpdateRemoteRecord(context.Context, Registration, string)                    {}
func (*retryRecords) CloseRemoteRecord(context.Context, string, string, string, workspace.Status) {}
func (*retryRecords) PersistPrepared(context.Context, CreatePlan) error                           { return nil }
func (f *retryRecords) FinalizePersisted(context.Context, CreatePlan, workspace.Workspace) error {
	if f.finalizeErr != nil {
		return f.finalizeErr
	}
	f.didFinalize = true
	return nil
}
func (f *retryRecords) ClosePersisted(context.Context, string) error { f.closed++; return nil }
func (*retryRecords) LocalRow(context.Context, string) (workspace.Record, bool) {
	return workspace.Record{}, false
}

func TestRetryClose_FinalizesOnceAfterFailure(t *testing.T) {
	instances := &retryInstances{isRuntimeOpen: true, workspace: workspace.Workspace{ID: "ws", Path: "/workspace"}, removeErr: errors.New("remove failed")}
	records := &retryRecords{}
	var summaryCalls, usageClears, commits, aborts, marks int
	service := New(Dependencies{
		Instances: instances, Records: records,
		BeginAgentCleanup:  func(context.Context, string) (any, error) { return "handle", nil },
		AbortAgentCleanup:  func(any) { aborts++; instances.calls = append(instances.calls, "abort") },
		CommitAgentCleanup: func(any) { commits++; instances.calls = append(instances.calls, "commit") },
		ClaimAgentSummary:  func(string) (bool, error) { marks++; return true, nil },
		SummarizeAgents:    func(string, workspace.CloseRequest) { summaryCalls++ },
		ClearAgentUsage:    func(string) { usageClears++ },
		MarkCleanupFailure: func(string, error) error { return nil },
		RemoveCleanup:      func(string) error { return nil },
	})
	cleanup := CleanupRequest{WorkspaceID: "ws", Path: "/workspace"}
	if err := service.RetryClose(context.Background(), cleanup); err == nil {
		t.Fatal("first retry succeeded")
	}
	if summaryCalls != 1 || aborts != 1 || commits != 0 {
		t.Fatalf("failed retry finalization = summary:%d aborts:%d commits:%d", summaryCalls, aborts, commits)
	}
	if want := []string{"active", "watch", "abort"}; !equalRetryCalls(instances.calls[len(instances.calls)-3:], want) {
		t.Fatalf("failed retry cleanup order = %v, want restore before abort", instances.calls)
	}
	if hasRetryCall(instances.calls, "memory") {
		t.Fatalf("failed retry removed workspace runtime: %v", instances.calls)
	}
	instances.removeErr = nil
	cleanup.AgentSummaryDone = true
	if err := service.RetryClose(context.Background(), cleanup); err != nil {
		t.Fatalf("successful retry: %v", err)
	}
	if summaryCalls != 1 || usageClears != 1 || commits != 1 || records.closed != 1 || marks != 1 {
		t.Fatalf("successful retry finalization = summary:%d usage:%d commits:%d closed:%d marks:%d", summaryCalls, usageClears, commits, records.closed, marks)
	}
	assertRetryStopBeforeRemove(t, instances.calls)
	assertRetryRemoveBeforeAgentCommit(t, instances.calls)
}

func hasRetryCall(calls []string, want string) bool {
	return slices.Contains(calls, want)
}

func assertRetryRemoveBeforeAgentCommit(t *testing.T, calls []string) {
	t.Helper()
	for index, call := range calls {
		if call == "commit" {
			if index < 2 || calls[index-2] != "remove" || calls[index-1] != "memory" {
				t.Fatalf("retry calls = %v, want path removal and runtime removal before agent cleanup commit", calls)
			}
			return
		}
	}
	t.Fatalf("retry calls = %v, want agent cleanup commit", calls)
}

func assertRetryStopBeforeRemove(t *testing.T, calls []string) {
	t.Helper()
	for index, call := range calls {
		if call == "remove" {
			if index == 0 || calls[index-1] != "terminals" {
				t.Fatalf("retry calls = %v, want terminal stop before removal", calls)
			}
			return
		}
	}
	t.Fatalf("retry calls = %v, want removal", calls)
}

func TestRetryClose_RestoreFailureKeepsAgentCleanupBlocked(t *testing.T) {
	instances := &retryInstances{
		isRuntimeOpen: true,
		workspace:     workspace.Workspace{ID: "ws", Path: "/workspace"},
		removeErr:     errors.New("remove failed"),
		watchErr:      errors.New("watch failed"),
	}
	var aborts int
	service := New(Dependencies{
		Instances: instances, Records: &retryRecords{},
		BeginAgentCleanup: func(context.Context, string) (any, error) { return "handle", nil },
		AbortAgentCleanup: func(any) { aborts++ },
	})
	err := service.RetryClose(context.Background(), CleanupRequest{WorkspaceID: "ws", Path: "/workspace"})
	if !errors.Is(err, instances.watchErr) {
		t.Fatalf("retry error = %v, want watch failure", err)
	}
	if aborts != 0 {
		t.Fatalf("agent cleanup aborts = %d, want 0 while runtime restoration fails", aborts)
	}
	if want := []string{"closing", "unwatch", "tracking", "terminals", "remove", "active", "watch", "closing"}; !equalRetryCalls(instances.calls, want) {
		t.Fatalf("retry calls = %v, want %v", instances.calls, want)
	}
}

func equalRetryCalls(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}

func TestSummarizeCloseAgents_OnlyClaimantRunsSideEffect(t *testing.T) {
	var marker struct {
		claimed bool
		lock    sync.Mutex
	}
	summaries := 0
	service := New(Dependencies{
		ClaimAgentSummary: func(string) (bool, error) {
			marker.lock.Lock()
			defer marker.lock.Unlock()
			if marker.claimed {
				return false, nil
			}
			marker.claimed = true
			return true, nil
		},
		SummarizeAgents: func(string, workspace.CloseRequest) {
			marker.lock.Lock()
			summaries++
			marker.lock.Unlock()
		},
	})
	errs := make(chan error, 2)
	for range 2 {
		go func() { errs <- service.summarizeCloseAgents(workspace.CloseRequest{WorkspaceID: "ws"}, false) }()
	}
	for range 2 {
		if err := <-errs; err != nil {
			t.Fatalf("summarize close agents: %v", err)
		}
	}
	if summaries != 1 {
		t.Fatalf("summaries = %d, want exactly one claimant", summaries)
	}
}

func TestRetryClose_StopFailureRetainsWorktreeAndReopensAdmissionAfterRestore(t *testing.T) {
	instances := &retryInstances{
		isRuntimeOpen: true,
		workspace:     workspace.Workspace{ID: "ws", Path: "/workspace"},
	}
	stopErr := errors.New("stop failed")
	isAdmissionOpen := false
	service := New(Dependencies{
		Instances: instances, Records: &retryRecords{},
		BeginAgentCleanup: func(context.Context, string) (any, error) { return "handle", stopErr },
		AbortAgentCleanup: func(any) { isAdmissionOpen = true },
	})
	err := service.RetryClose(context.Background(), CleanupRequest{WorkspaceID: "ws", Path: "/workspace"})
	if !errors.Is(err, stopErr) {
		t.Fatalf("retry error = %v, want stop failure", err)
	}
	if !isAdmissionOpen {
		t.Fatal("agent admission did not reopen after runtime restoration")
	}
	if want := []string{"closing", "unwatch", "tracking", "terminals", "active", "watch"}; !equalRetryCalls(instances.calls, want) {
		t.Fatalf("retry calls = %v, want retained worktree and restored runtime", instances.calls)
	}
}
