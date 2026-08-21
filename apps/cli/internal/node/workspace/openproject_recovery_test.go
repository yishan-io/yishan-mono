package workspace

import (
	"context"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/tokenusage/collection"
	"yishan/apps/cli/internal/tokenusage/record"
	"yishan/apps/cli/internal/tokenusage/scanner"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

type recoveryScanRepository struct{}

func (recoveryScanRepository) ReplaceAgentHourlyRows(context.Context, string, []sqlite.HourlyUsageRow) error {
	return nil
}

func (recoveryScanRepository) ListDirtyHourlyRows(context.Context) ([]sqlite.HourlyUsageRow, error) {
	return nil, nil
}

func (recoveryScanRepository) MarkHourlyRowsSynced(context.Context, []sqlite.HourlyUsageRow, int64) error {
	return nil
}

func (recoveryScanRepository) GetHourlyUsageSyncState(context.Context) (sqlite.HourlyUsageSyncState, error) {
	return sqlite.HourlyUsageSyncState{}, nil
}

func TestWorkspaceOpenProject_ReturnsBeforeScheduledRecoveryScanCompletes(t *testing.T) {
	s := newTestHandler(t)
	collector, scanStarted, releaseScan, scanFinished := newBlockingRecoveryCollector()
	t.Cleanup(collector.Close)
	t.Cleanup(releaseScan)
	s.deps.TokenUsage = collector

	resultCh, errorCh := openFolderProjectAsync(s, t.TempDir())
	assertPromptFolderOpen(t, resultCh, errorCh)
	waitForSignal(t, scanStarted, "scheduled recovery scan did not start")
	releaseScan()
	waitForSignal(t, scanFinished, "scheduled recovery scan did not finish after release")
}

func newBlockingRecoveryCollector() (*collection.Collector, <-chan struct{}, func(), <-chan struct{}) {
	scanStarted := make(chan struct{})
	releaseScan := make(chan struct{})
	scanFinished := make(chan struct{})
	blockingScanner := scanner.NewRegistry()
	blockingScanner.Register("pi", scanner.ScannerFunc(func(context.Context, scanner.ScanInput) ([]record.UsageRecord, error) {
		close(scanStarted)
		<-releaseScan
		close(scanFinished)
		return nil, nil
	}))
	collector := collection.NewCollector(
		instance.NewRegistry(files.NewFileService()), nil, recoveryScanRepository{}, nil, blockingScanner,
	)
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseScan) }) }
	return collector, scanStarted, release, scanFinished
}

func openFolderProjectAsync(s *Service, folderPath string) (<-chan rpc.WorkspaceOpenProjectResult, <-chan error) {
	resultCh := make(chan rpc.WorkspaceOpenProjectResult, 1)
	errorCh := make(chan error, 1)
	go func() {
		result, err := s.OpenProject(context.Background(), rpc.WorkspaceOpenProjectParams{Workspaces: []rpc.WorkspaceOpenProjectEntry{{
			WorkspaceID: "folder-recovery", WorktreePath: folderPath, Kind: string(workspace.KindFolder),
		}}})
		if err != nil {
			errorCh <- err
			return
		}
		resultCh <- result.(rpc.WorkspaceOpenProjectResult)
	}()
	return resultCh, errorCh
}

func assertPromptFolderOpen(t *testing.T, resultCh <-chan rpc.WorkspaceOpenProjectResult, errorCh <-chan error) {
	t.Helper()
	select {
	case err := <-errorCh:
		t.Fatalf("OpenProject: %v", err)
	case result := <-resultCh:
		if len(result.Opened) != 1 || result.Opened[0] != "folder-recovery" {
			t.Fatalf("OpenProject result = %#v, want folder opened", result)
		}
	case <-time.After(time.Second):
		t.Fatal("OpenProject blocked on recovery scan")
	}
}

func waitForSignal(t *testing.T, signal <-chan struct{}, failureMessage string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(time.Second):
		t.Fatal(failureMessage)
	}
}
