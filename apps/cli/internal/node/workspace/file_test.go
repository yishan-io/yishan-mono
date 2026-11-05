package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
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
