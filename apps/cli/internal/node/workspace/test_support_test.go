package workspace

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
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/relay"
	modellist "yishan/apps/cli/internal/agent/catalog"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	nodeagent "yishan/apps/cli/internal/node/agent"
	"yishan/apps/cli/internal/node/context"
	"yishan/apps/cli/internal/node/hook"
	"yishan/apps/cli/internal/rpc"
	term "yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/instance"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
)

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
func newTestService(t *testing.T, runtime *session.Session, nodeID string) *Service {
	svc, _ := newTestServiceWithAgent(t, runtime, nodeID)
	return svc
}

func newTestServiceWithAgent(t *testing.T, runtime *session.Session, nodeID string) (*Service, *nodeagent.Service) {
	t.Helper()
	root := t.TempDir()
	events := eventbus.NewHub()
	filesService := files.NewFileService()
	registry := instance.NewRegistry(filesService)
	gitService := git.NewGitService()
	terminals := term.NewManager()
	prTracker := workspaceprtracker.New(workspaceprtracker.TrackerDeps{
		Instances: registry,
		Gits:      gitService,
		OnPullRequestUpdated: func(event workspaceprtracker.PullRequestUpdatedEvent) {
			PublishPullRequestUpdated(events, event)
		},
	})
	watchers := NewWatchers(events, prTracker.RefreshWorkspaceByPath)
	registry.SetOnRemoved(func(workspaceID string, path string) {
		watchers.Unwatch(path)
		prTracker.StopTracking(workspaceID)
	})

	var agentSvc *nodeagent.Service
	svc := NewService(Deps{
		Registry:    registry,
		Files:       filesService,
		Git:         gitService,
		Terminals:   terminals,
		Events:      events,
		Watchers:    watchers,
		PRTracker:   prTracker,
		Session:     runtime,
		NodeID:      nodeID,
		LogFilePath: filepath.Join(root, "daemon.log"),
		ServerCtx:   context.Background(),
		CreateCompleted: func(plan application.CreatePlan, created workspace.Workspace, warnings []any) {
			agentSvc.PublishWorkspaceCreateCompleted(plan, created, warnings)
		},
		Usage: hook.NewUsageTracker(),
	})
	agentSvc = nodeagent.NewService(nodeagent.Deps{
		Workspace:         svc,
		AgentMgr:          agentmanager.NewManager(),
		PIAuth:            nodeagent.NewManagedPiAuthStore(),
		ModelList:         modellist.NewService(),
		Events:            events,
		Terminals:         terminals,
		ContextStore:      contextstore.NewStore(""),
		AgentLifecycleCtx: context.Background(),
		ServerCtx:         context.Background(),
	})
	svc.SetRelayClient(relay.NewClient(relay.ClientConfig{
		Session: runtime,
		NodeID:  nodeID,
		// No URL/static token: the client stays disconnected unless a test
		// wires it to a fake relay (wireRelayReader/wireRelayCapture).
		Server:  rpc.NewServer(noopRPCHandler{}),
		Handler: svc,
		Events:  events,
	}))
	router := rpc.NewRouter()
	router.Register("list", &rpc.WorkspaceHandler{Services: svc})
	router.Register("workspace", &rpc.WorkspaceHandler{Services: svc})
	router.Register("file", &rpc.FileHandler{Services: svc})
	router.Register("git", &rpc.GitHandler{Services: svc})
	svc.router = router
	return svc, agentSvc
}

// newTestHandler builds a plain workspace service with a wired router.
func newTestHandler(t *testing.T) *Service {
	t.Helper()
	return newTestService(t, nil, "node-1")
}

// setTestDatabase attaches the local SQLite handle to the service.
func (s *Service) setTestDatabase(database *sql.DB) {
	s.deps.Database = database
}

// callRPCForTest routes a method+params through the namespace router, the
// same path rpc.Server uses for live connections.
func (s *Service) callRPCForTest(ctx context.Context, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, &rpc.Connection{}, method, params)
}

// expectEventTopic waits for an event with the wanted topic on the hub.
func expectEventTopic(t *testing.T, events <-chan eventbus.Event, wantTopic string) eventbus.Event {
	t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		select {
		case event := <-events:
			if event.Topic == wantTopic {
				return event
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %s event", wantTopic)
		}
	}
}

// expectNoEvent fails when an event arrives within the wait window.
func expectNoEvent(t *testing.T, events <-chan eventbus.Event, wait time.Duration) {
	t.Helper()
	select {
	case event := <-events:
		t.Fatalf("expected no event, got topic %q", event.Topic)
	case <-time.After(wait):
	}
}

// noopRPCHandler answers every method with method-not-found; relay dispatch
// tests only need a live rpc server, not real namespace routing.
type noopRPCHandler struct{}

// Call implements rpc.Handler.
func (noopRPCHandler) Call(ctx context.Context, connection *rpc.Connection, method string, params json.RawMessage) (any, error) {
	return nil, rpc.NewRPCError(rpc.CodeMethodNotFound, "noop: "+method)
}

var lifecycleEventTopics = map[string]bool{
	"workspaceSnapshotChanged": true,
	"workspaceCreateStarted":   true,
	"workspaceCreateProgress":  true,
	"workspaceCreateCompleted": true,
	"workspaceCreateFailed":    true,
	"workspaceStateChanged":    true,
}
