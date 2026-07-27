package watchers

import (
	"encoding/json"
	"strconv"
	"testing"
)

func TestBoundChangedPaths_OverflowSignalsFullRefresh(t *testing.T) {
	paths := make([]string, maxChangedPathsPerEvent+1)
	for index := range paths {
		paths[index] = "src/file-" + strconv.Itoa(index)
	}

	got := boundChangedPaths(paths)
	if got == nil || len(got) != 0 {
		t.Fatalf("boundChangedPaths() = %#v, want non-nil empty full-refresh signal", got)
	}
}

func TestBoundChangedPaths_OverflowSerializesAsEmptyArray(t *testing.T) {
	paths := make([]string, maxChangedPathsPerEvent+1)
	for index := range paths {
		paths[index] = "src/file-" + strconv.Itoa(index)
	}

	encoded, err := json.Marshal(struct {
		ChangedRelativePaths []string `json:"changedRelativePaths"`
	}{
		ChangedRelativePaths: boundChangedPaths(paths),
	})
	if err != nil {
		t.Fatalf("marshal overflow signal: %v", err)
	}

	if string(encoded) != `{"changedRelativePaths":[]}` {
		t.Fatalf("overflow signal JSON = %s, want empty array", encoded)
	}
}

func TestWorktreeWatcher_FileBurstOverflowSendsFullRefreshSignal(t *testing.T) {
	hub := newEventHub()
	watcher := &worktreeWatcher{
		workspaceID: "workspace-1",
		path:        "/tmp/repo",
		sink:        eventHubWatcherSink{events: hub},
	}

	for index := 0; index <= maxChangedPathsPerEvent; index++ {
		watcher.scheduleFileEmit("src/file-" + strconv.Itoa(index))
	}

	event := expectEventTopic(t, hub.events, "workspaceFilesChanged")
	payload := event.Payload.(map[string]any)
	changedPaths := payload["changedRelativePaths"].([]string)
	if changedPaths == nil || len(changedPaths) != 0 {
		t.Fatalf("changedRelativePaths = %#v, want non-nil empty full-refresh signal", changedPaths)
	}
}

func TestBoundChangedPaths_KeepsSmallBatches(t *testing.T) {
	paths := []string{"src/a.ts", "src/b.ts"}

	got := boundChangedPaths(paths)
	if len(got) != len(paths) {
		t.Fatalf("boundChangedPaths() = %d paths, want %d", len(got), len(paths))
	}
}
