package workspace

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"
	localdb "yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// ============================= close =============================

func TestCloseLocalNode_RecordSequence(t *testing.T) {
	var recorder apiCallRecorder
	apiServer := newWorkspaceAPIStub(t, &recorder)
	database := openMigratedTestDB(t)
	s := newBehaviorHandler(t, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	path := t.TempDir() // plain dir: no git teardown needed, close succeeds fast
	openLocalWorkspace(t, s, "ws-close-1", path)
	store := localdb.NewWorkspaceStore(database)
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "ws-close-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: path,
		State: string(workspace.StateActive),
	}); err != nil {
		t.Fatalf("create persisted workspace: %v", err)
	}

	raw, err := json.Marshal(map[string]any{
		"workspaceId": "ws-close-1", "organizationId": "org-1", "projectId": "project-1", "removeBranch": true,
	})
	if err != nil {
		t.Fatalf("marshal close params: %v", err)
	}

	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceClose, raw)
	if err != nil {
		t.Fatalf("handleWorkspaceClose: %v", err)
	}
	closeResult, ok := result.(map[string]any)
	if !ok || closeResult["workspaceId"] != "ws-close-1" {
		t.Fatalf("close result = %#v, want workspaceId ws-close-1", result)
	}
	if workspaceEntry, ok := closeResult["workspace"].(map[string]string); !ok || workspaceEntry["status"] != "closed" {
		t.Fatalf("close result workspace entry = %#v, want status closed", closeResult["workspace"])
	}

	// Cloud record changes: "closing" before teardown, terminal "closed" after.
	if want := []string{"closing", "closed"}; !reflect.DeepEqual(recorder.closeStatuses(), want) {
		t.Fatalf("remote close statuses = %v, want %v", recorder.closeStatuses(), want)
	}

	// Local record: SQLite row flipped to closed; runtime record removed.
	row, err := store.Get(context.Background(), "ws-close-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.Status != "closed" {
		t.Fatalf("persisted status = %q, want closed", row.Status)
	}
	if _, ok := s.deps.Registry.Get("ws-close-1"); ok {
		t.Fatal("expected workspace removed from manager after close")
	}

	// Close publishes no frontend lifecycle events.
	if extra := lifecycleTopicNames(collectFor(t, eventCh, 500*time.Millisecond)); len(extra) != 0 {
		t.Fatalf("expected no lifecycle events on close, got %v", extra)
	}
}

func TestCloseRemoteNode_Relays(t *testing.T) {
	database := openMigratedTestDB(t)
	s := newBehaviorHandler(t, nil, "node-1", database)
	relayMessages := wireRelayCapture(t, s, map[string]any{"accepted": true})

	store := localdb.NewWorkspaceStore(database)
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "ws-remote-close", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-2",
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: t.TempDir(),
		State: string(workspace.StateActive),
	}); err != nil {
		t.Fatalf("create persisted workspace: %v", err)
	}

	raw, err := json.Marshal(map[string]any{
		"workspaceId": "ws-remote-close", "organizationId": "org-1", "projectId": "project-1", "removeBranch": true,
	})
	if err != nil {
		t.Fatalf("marshal close params: %v", err)
	}

	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceClose, raw)
	if err != nil {
		t.Fatalf("handleWorkspaceClose: %v", err)
	}
	closeResult, ok := result.(map[string]any)
	if !ok || closeResult["status"] != "closing" {
		t.Fatalf("close result = %#v, want status closing (relayed)", result)
	}

	var relayMsg map[string]any
	select {
	case relayMsg = <-relayMessages:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for close relay dispatch")
	}
	envelope := decodeRelayCloseEnvelope(t, relayMsg)
	if envelope.Change != relayChangeWorkspaceCloseRequest {
		t.Fatalf("relay change = %q, want %q", envelope.Change, relayChangeWorkspaceCloseRequest)
	}
	if envelope.WorkspaceID != "ws-remote-close" || envelope.TargetNodeID != "node-2" || envelope.SourceNodeID != "node-1" {
		t.Fatalf("relay close envelope = %#v, want workspaceId ws-remote-close target node-2 source node-1", envelope)
	}
	if !envelope.RemoveBranch {
		t.Fatal("relay close envelope must carry removeBranch")
	}

	// No local teardown: SQLite row untouched, no runtime record created.
	row, err := store.Get(context.Background(), "ws-remote-close")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.Status != "active" {
		t.Fatalf("persisted status = %q, want active (origin does not close remote rows)", row.Status)
	}
	if len(s.deps.Registry.List()) != 0 {
		t.Fatalf("expected no manager runtime records, got %v", s.deps.Registry.List())
	}
}
