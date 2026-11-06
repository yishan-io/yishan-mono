package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestFile_Search(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "alpha-search.ts"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	handler := newTestService(t, nil, "node-1")
	openedWorkspace, err := handler.Open(workspace.OpenRequest{ID: "ws-1", Path: root})
	if err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	params, err := json.Marshal(map[string]any{
		"workspaceId": openedWorkspace.ID,
		"query":       "alph",
		"limit":       10,
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, err := handler.callRPCForTest(context.Background(), rpc.MethodFileSearch, params)
	if err != nil {
		t.Fatalf("dispatch file.search: %v", err)
	}
	results, ok := result.([]files.FileSearchResult)
	if !ok {
		t.Fatalf("expected []files.FileSearchResult, got %T", result)
	}
	if len(results) != 1 || results[0].Path != "alpha-search.ts" {
		t.Fatalf("unexpected search results: %+v", results)
	}
}

func TestFile_ListCancellation(t *testing.T) {
	for _, source := range []string{"caller", "server"} {
		t.Run(source, func(t *testing.T) {
			handler := newTestService(t, nil, "node-1")
			opened, err := handler.Open(workspace.OpenRequest{ID: "ws-1", Path: t.TempDir()})
			if err != nil {
				t.Fatal(err)
			}
			caller, cancelCaller := context.WithCancel(context.Background())
			server, cancelServer := context.WithCancel(context.Background())
			defer cancelCaller()
			defer cancelServer()
			handler.deps.ServerCtx = server
			if source == "caller" {
				cancelCaller()
			} else {
				cancelServer()
			}
			params, err := json.Marshal(rpc.FileListParams{WorkspaceID: opened.ID, Recursive: true})
			if err != nil {
				t.Fatal(err)
			}
			entries, err := handler.callRPCForTest(caller, rpc.MethodFileList, params)
			if !errors.Is(err, context.Canceled) {
				t.Fatalf("entries=%v err=%v", entries, err)
			}
		})
	}
}

func TestFile_ListSnapshotRPC(t *testing.T) {
	handler := newTestService(t, nil, "node-1")
	root := t.TempDir()
	if output, err := exec.Command("git", "init", root).CombinedOutput(); err != nil {
		t.Fatalf("%s: %v", output, err)
	}
	opened, err := handler.Open(workspace.OpenRequest{ID: "snapshot", Path: root})
	if err != nil {
		t.Fatal(err)
	}
	entered, release := blockListingExclude(t, root)
	completed := make(chan error, 1)
	go func() { completed <- checkSnapshotRPC(t, handler, opened.ID, false) }()
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("worker never entered")
	}
	handler.deps.Files.InvalidateWorkspacePaths(root, []string{"changed"})
	close(release)
	select {
	case err := <-completed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("RPC waited for quiet")
	}
	if err := checkSnapshotRPC(t, handler, opened.ID, true); err != nil {
		t.Fatal(err)
	}
	params, _ := json.Marshal(rpc.FileListParams{WorkspaceID: opened.ID, Recursive: true})
	response, err := handler.callRPCForTest(context.Background(), rpc.MethodFileList, params)
	if _, ok := response.([]files.FileEntry); !ok || err != nil {
		t.Fatalf("legacy=%T err=%v", response, err)
	}
}

func checkSnapshotRPC(t *testing.T, handler *Service, id string, isFresh bool) error {
	t.Helper()
	params := json.RawMessage(`{"workspaceId":"` + id + `","recursive":true,"includeFreshness":true}`)
	response, err := handler.callRPCForTest(context.Background(), rpc.MethodFileList, params)
	if err != nil {
		return err
	}
	wire, err := json.Marshal(response)
	var snapshot struct {
		Files   []files.FileEntry `json:"files"`
		IsFresh *bool             `json:"isFresh"`
	}
	if err != nil || json.Unmarshal(wire, &snapshot) != nil || snapshot.IsFresh == nil || *snapshot.IsFresh != isFresh {
		t.Errorf("snapshot=%s err=%v", wire, err)
	}
	return nil
}

func blockListingExclude(t *testing.T, root string) (<-chan struct{}, chan struct{}) {
	t.Helper()
	exclude := filepath.Join(root, ".git", "info", "exclude")
	if err := os.Remove(exclude); err != nil {
		t.Fatal(err)
	}
	if output, err := exec.Command("mkfifo", exclude).CombinedOutput(); err != nil {
		t.Skipf("mkfifo unavailable: %s %v", output, err)
	}
	entered, release := make(chan struct{}), make(chan struct{})
	go func() {
		writer, err := os.OpenFile(exclude, os.O_WRONLY, 0600)
		if err != nil {
			t.Error(err)
			return
		}
		close(entered)
		<-release
		// Unlink first so the subsequent ignored-files command does not block again.
		if err := os.Remove(exclude); err != nil {
			t.Error(err)
		}
		if err := writer.Close(); err != nil {
			t.Error(err)
		}
	}()
	return entered, release
}

func TestFile_ShallowSnapshotRPC(t *testing.T) {
	handler := newTestService(t, nil, "node-1")
	root := t.TempDir()
	if output, err := exec.Command("git", "init", root).CombinedOutput(); err != nil {
		t.Fatalf("%s: %v", output, err)
	}
	if err := os.WriteFile(filepath.Join(root, "entry"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	opened, err := handler.Open(workspace.OpenRequest{ID: "shallow", Path: root})
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		checkShallowSnapshotRPC(t, handler, opened.ID, "", true)
	}
	handler.deps.Files.InvalidateWorkspacePaths(root, []string{"entry"})
	entered, release := blockListingExclude(t, root)
	completed := make(chan struct{})
	go func() { checkShallowSnapshotRPC(t, handler, opened.ID, "", false); close(completed) }()
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("shallow listing never entered")
	}
	handler.deps.Files.InvalidateWorkspacePaths(root, []string{"entry"})
	close(release)
	select {
	case <-completed:
	case <-time.After(2 * time.Second):
		t.Fatal("shallow listing did not finish")
	}
	checkShallowSnapshotRPC(t, handler, opened.ID, "", true)
	if err := os.Mkdir(filepath.Join(root, "empty"), 0700); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		checkShallowSnapshotRPC(t, handler, opened.ID, "empty", true)
	}
}

func checkShallowSnapshotRPC(t *testing.T, handler *Service, id, path string, fresh bool) {
	t.Helper()
	params, err := json.Marshal(rpc.FileListParams{WorkspaceID: id, Path: path, IncludeFreshness: true})
	if err != nil {
		t.Error(err)
		return
	}
	response, err := handler.callRPCForTest(context.Background(), rpc.MethodFileList, params)
	if err != nil {
		t.Error(err)
		return
	}
	wire, err := json.Marshal(response)
	var snapshot struct {
		Files   json.RawMessage `json:"files"`
		IsFresh bool            `json:"isFresh"`
	}
	if err != nil || json.Unmarshal(wire, &snapshot) != nil || snapshot.IsFresh != fresh {
		t.Errorf("snapshot=%s err=%v wantFresh=%v", wire, err, fresh)
	}
	if path == "empty" && string(snapshot.Files) != "[]" {
		t.Errorf("empty files=%s", snapshot.Files)
	}
}
