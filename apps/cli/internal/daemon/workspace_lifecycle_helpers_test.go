package daemon

// Phase 0 of the CLI/daemon refactor plan (architecture/refactor/cli.md):
// record current workspace lifecycle behavior as tests. These tests are the
// regression baseline for Phases 1-6 — they describe today's create/close
// event order, cloud + local record changes, per-step rollback, startup
// hydration, and health transitions. Zero production code is touched.
//
// Reference event sequence for a LOCAL create (current behavior):
//
//	handleWorkspaceCreate (sync):
//	  1. workspaceSnapshotChanged {change:"created"}
//	  2. workspaceCreateStarted   {workspaceId, nodeId}
//	async executeWorkspaceCreate:
//	  3. workspaceCreateProgress  {stepId:"worktree", running}  → completed
//	  4. workspaceCreateProgress  {stepId:"context",  running}  → skipped (ContextEnabled=false)
//	  5. workspaceCreateProgress  {stepId:"setup",    running}  → skipped (no hook)
//	  6. workspaceSnapshotChanged {change:"updated"}            ← finalize (before "complete")
//	  7. workspaceCreateProgress  {stepId:"complete", completed}
//	  8. workspaceCreateCompleted {workspaceId, worktreePath}
//
// A failed create replaces 6-8 with:
//	  workspaceCreateProgress {stepId:"complete", failed}
//	  workspaceCreateFailed   {workspaceId, message}

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/relay"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
)

// lifecycleEventTopics are the workspace lifecycle events this suite records.
// Other workspace events (workspaceFilesChanged, workspacePullRequestUpdated)
// are intentionally excluded so watcher/PR-tracker noise cannot break the
// sequence assertions.
var lifecycleEventTopics = map[string]bool{
	"workspaceSnapshotChanged": true,
	"workspaceCreateStarted":   true,
	"workspaceCreateProgress":  true,
	"workspaceCreateCompleted": true,
	"workspaceCreateFailed":    true,
	"workspaceStateChanged":    true,
}

// ============================= helpers =============================

type apiCall struct {
	method string
	path   string
	body   string
}

type apiCallRecorder struct {
	mu    sync.Mutex
	calls []apiCall
}

func (r *apiCallRecorder) add(method string, path string, body string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls = append(r.calls, apiCall{method: method, path: path, body: body})
}

func (r *apiCallRecorder) snapshot() []apiCall {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]apiCall, len(r.calls))
	copy(out, r.calls)
	return out
}

func (r *apiCallRecorder) count(method string, pathSuffix string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	count := 0
	for _, call := range r.calls {
		if call.method == method && strings.HasSuffix(call.path, pathSuffix) {
			count++
		}
	}
	return count
}

// closeStatuses returns the status values of PATCH .../workspaces/close calls
// in the order they were made ("closing", "closed", ...).
func (r *apiCallRecorder) closeStatuses() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []string
	for _, call := range r.calls {
		if call.method != http.MethodPatch || !strings.HasSuffix(call.path, "/workspaces/close") {
			continue
		}
		var payload struct {
			Status string `json:"status"`
		}
		_ = json.Unmarshal([]byte(call.body), &payload)
		if payload.Status == "" {
			payload.Status = "closed"
		}
		out = append(out, payload.Status)
	}
	return out
}

const apiWorkspaceRecord = `{"workspace":{"id":"ws-record","organizationId":"org-1","projectId":"project-1","userId":"user-1","nodeId":"node-1","kind":"worktree","status":"provisioning","branch":"feature","sourceBranch":"main","localPath":"","createdAt":"2026-06-30T00:00:00.000Z","updatedAt":"2026-06-30T00:00:00.000Z"}}`

// newWorkspaceAPIStub serves the workspace CRUD endpoints for org-1/project-1
// and records every request. Unknown paths 404 (usage-collector scans and
// similar best-effort calls tolerate this).
func newWorkspaceAPIStub(t *testing.T, recorder *apiCallRecorder) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		recorder.add(r.Method, r.URL.Path, string(body))
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/orgs/org-1/projects/project-1/workspaces":
			_, _ = w.Write([]byte(apiWorkspaceRecord))
		case r.Method == http.MethodPatch && strings.HasPrefix(r.URL.Path, "/orgs/org-1/projects/project-1/workspaces"):
			_, _ = w.Write([]byte(apiWorkspaceRecord))
		case r.Method == http.MethodGet && r.URL.Path == "/orgs/org-1/nodes":
			_, _ = w.Write([]byte(`{"nodes":[{"id":"node-2","organizationId":"org-1","name":"node-2"}]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/orgs/org-1/projects/project-1/workspaces":
			_, _ = w.Write([]byte(`{"workspaces":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server
}

func apiConfiguredRuntime(server *httptest.Server) *cliruntime.Runtime {
	return cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
}

func openMigratedTestDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

// collectUntil drains the event channel until terminalTopic arrives and
// returns every event collected (including the terminal one). Fails the test
// on timeout so async create goroutines cannot hang the suite.
func collectUntil(t *testing.T, ch <-chan frontendEvent, terminalTopic string, timeout time.Duration) []frontendEvent {
	t.Helper()
	var collected []frontendEvent
	deadline := time.After(timeout)
	for {
		select {
		case event := <-ch:
			collected = append(collected, event)
			if event.Topic == terminalTopic {
				return collected
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %q; collected: %v", terminalTopic, eventTopicNames(collected))
		}
	}
}

// collectFor drains the event channel for the grace period and returns what
// arrived. Used after a terminal event to prove no further lifecycle events
// were emitted.
func collectFor(t *testing.T, ch <-chan frontendEvent, grace time.Duration) []frontendEvent {
	t.Helper()
	var collected []frontendEvent
	deadline := time.After(grace)
	for {
		select {
		case event := <-ch:
			collected = append(collected, event)
		case <-deadline:
			return collected
		}
	}
}

func eventTopicNames(events []frontendEvent) []string {
	names := make([]string, 0, len(events))
	for _, event := range events {
		names = append(names, event.Topic)
	}
	return names
}

func lifecycleTopicNames(events []frontendEvent) []string {
	var names []string
	for _, event := range events {
		if lifecycleEventTopics[event.Topic] {
			names = append(names, event.Topic)
		}
	}
	return names
}

func assertTopicSequence(t *testing.T, events []frontendEvent, want []string) {
	t.Helper()
	got := lifecycleTopicNames(events)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("lifecycle topic sequence = %v, want %v", got, want)
	}
}

// wireRelayCapture runs a real relay client against a fake relay that echoes a
// verdict and forwards every received JSON-RPC message (the relay envelope) to
// the returned channel.
func wireRelayCapture(t *testing.T, h *JSONRPCHandler, result map[string]any) <-chan map[string]any {
	t.Helper()
	received := make(chan map[string]any, 16)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var msg map[string]any
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}
		received <- msg
		_ = conn.WriteJSON(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": result})
	}))
	t.Cleanup(server.Close)

	client := relay.NewClient(relay.ClientConfig{
		Runtime:     nil,
		NodeID:      h.nodeID,
		URL:         server.URL,
		StaticToken: "test-token",
		Server:      h.rpcServer,
		Handler:     h,
		Events:      h.events,
	})
	h.relayClient = client
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go client.Run(ctx)
	waitForRelayConnected(t, client)
	return received
}

func decodeRelayCreateEnvelope(t *testing.T, msg map[string]any) relay.CreateEnvelope {
	t.Helper()
	params, ok := msg["params"].(map[string]any)
	if !ok {
		t.Fatalf("relay message params = %T, want map (%v)", msg["params"], msg)
	}
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal relay params: %v", err)
	}
	var envelope relay.CreateEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("decode relay create envelope: %v", err)
	}
	return envelope
}

func decodeRelayCloseEnvelope(t *testing.T, msg map[string]any) relayWorkspaceCloseEnvelope {
	t.Helper()
	params, ok := msg["params"].(map[string]any)
	if !ok {
		t.Fatalf("relay message params = %T, want map (%v)", msg["params"], msg)
	}
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal relay params: %v", err)
	}
	var envelope relayWorkspaceCloseEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("decode relay close envelope: %v", err)
	}
	return envelope
}

func decodeCreateStartedEvent(t *testing.T, event frontendEvent) workspaceCreateStartedEvent {
	t.Helper()
	started, ok := event.Payload.(workspaceCreateStartedEvent)
	if !ok {
		t.Fatalf("workspaceCreateStarted payload = %T, want workspaceCreateStartedEvent", event.Payload)
	}
	return started
}

func decodeProgressEvents(t *testing.T, events []frontendEvent) []workspace.CreateProgressEvent {
	t.Helper()
	var progress []workspace.CreateProgressEvent
	for _, event := range events {
		if event.Topic != "workspaceCreateProgress" {
			continue
		}
		progressEvent, ok := event.Payload.(workspace.CreateProgressEvent)
		if !ok {
			t.Fatalf("workspaceCreateProgress payload = %T, want workspace.CreateProgressEvent", event.Payload)
		}
		progress = append(progress, progressEvent)
	}
	return progress
}

func progressStepSequence(progress []workspace.CreateProgressEvent) []string {
	out := make([]string, 0, len(progress))
	for _, event := range progress {
		out = append(out, event.StepID+":"+string(event.Status))
	}
	return out
}

// newBehaviorHandler builds a handler with the given manager, runtime and
// node. When database is non-nil it is attached directly (bypassing
// SetLocalDatabase so no token-usage collector is wired into the test).
func newBehaviorHandler(t *testing.T, manager *workspace.Manager, runtime *cliruntime.Runtime, nodeID string, database *sql.DB) *JSONRPCHandler {
	t.Helper()
	h := newTestJSONRPCHandler(t, manager, runtime, nodeID)
	h.setTestDatabase(database)
	return h
}

func findTopic(events []frontendEvent, topic string) frontendEvent {
	for _, event := range events {
		if event.Topic == topic {
			return event
		}
	}
	return frontendEvent{}
}

func openLocalWorkspace(t *testing.T, manager *workspace.Manager, id string, path string) {
	t.Helper()
	if _, err := manager.Open(workspace.OpenRequest{ID: id, Path: path, OrgID: "org-1", ProjectID: "project-1"}); err != nil {
		t.Fatalf("open workspace %s: %v", id, err)
	}
}

func containsString(list []string, target string) bool {
	for _, item := range list {
		if item == target {
			return true
		}
	}
	return false
}
