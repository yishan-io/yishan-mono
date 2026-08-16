package workspace

import (
	"database/sql"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"
	localdb "yishan/apps/cli/internal/adapter/sqlite"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/workspace"
)

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

func newBehaviorHandler(t *testing.T, runtime *cliruntime.Runtime, nodeID string, database *sql.DB) *Service {
	t.Helper()
	s := newTestService(t, runtime, nodeID)
	s.setTestDatabase(database)
	return s
}

func findTopic(events []internalevents.Event, topic string) internalevents.Event {
	for _, event := range events {
		if event.Topic == topic {
			return event
		}
	}
	return internalevents.Event{}
}

func openLocalWorkspace(t *testing.T, services *Service, id string, path string) {
	t.Helper()
	if _, err := services.Open(workspace.OpenRequest{ID: id, Path: path, OrgID: "org-1", ProjectID: "project-1"}); err != nil {
		t.Fatalf("open workspace %s: %v", id, err)
	}
}

// openTestWorkspace registers a workspace instance at the given path via the
// production open path.

func openTestWorkspace(t *testing.T, services *Service, id string, path string) workspace.Workspace {
	t.Helper()
	ws, err := services.Open(workspace.OpenRequest{ID: id, Path: path})
	if err != nil {
		t.Fatalf("open test workspace %s: %v", id, err)
	}
	return ws
}

func containsString(list []string, target string) bool {
	for _, item := range list {
		if item == target {
			return true
		}
	}
	return false
}

// newTestService builds a workspace application service for tests with a
// router wired for the workspace/file/git namespaces.

type apiCall struct {
	method string
	path   string
	body   string
}

type apiCallRecorder struct {
	mu    sync.Mutex
	calls []apiCall
}
