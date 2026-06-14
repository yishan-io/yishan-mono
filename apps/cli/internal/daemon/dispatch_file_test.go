package daemon

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/workspace"
)

func TestDispatchFile_Search(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "alpha-search.ts"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	manager := workspace.NewManager()
	openedWorkspace, err := manager.Open(workspace.OpenRequest{ID: "ws-1", Path: root})
	if err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	params, err := json.Marshal(map[string]any{
		"workspaceId": openedWorkspace.ID,
		"query":       "alph",
		"limit":       10,
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, err := handler.dispatchFile(context.Background(), MethodFileSearch, params)
	if err != nil {
		t.Fatalf("dispatch file.search: %v", err)
	}
	results, ok := result.([]workspace.FileSearchResult)
	if !ok {
		t.Fatalf("expected []workspace.FileSearchResult, got %T", result)
	}
	if len(results) != 1 || results[0].Path != "alpha-search.ts" {
		t.Fatalf("unexpected search results: %+v", results)
	}
}
