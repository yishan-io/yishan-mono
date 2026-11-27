package project

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
)

// newTestService builds a project application service for tests with a router
// wired for the project namespace.
func newTestService(t *testing.T, runtime *session.Session) *Service {
	t.Helper()
	svc := NewService(Deps{Session: runtime})
	router := rpc.NewRouter()
	router.Register("project", &rpc.ProjectHandler{Services: svc})
	svc.router = router
	return svc
}

// callRPCForTest routes a method+params through the namespace router, the
// same path rpc.Server uses for live connections.
func (s *Service) callRPCForTest(ctx context.Context, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, &rpc.Connection{}, method, params)
}

func marshalParams(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	return raw
}

func requireRPCError(t *testing.T, err error, messageContains string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error containing %q, got nil", messageContains)
	}
	if !strings.Contains(err.Error(), messageContains) {
		t.Fatalf("expected error containing %q, got %q", messageContains, err.Error())
	}
}

func strPtr(value string) *string {
	return &value
}

// fakeAPI records api-service requests and answers them through respond.
type fakeAPI struct {
	mu       sync.Mutex
	requests []fakeRequest
	respond  func(request fakeRequest) (int, string)
}

type fakeRequest struct {
	Method string
	Path   string
	Body   map[string]any
}

func (api *fakeAPI) serve(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	request := fakeRequest{Method: r.Method, Path: r.URL.RequestURI()}
	_ = json.Unmarshal(raw, &request.Body)
	api.mu.Lock()
	api.requests = append(api.requests, request)
	respond := api.respond
	api.mu.Unlock()
	status, body := respond(request)
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

func (api *fakeAPI) calls(method string, pathPrefix string) []fakeRequest {
	api.mu.Lock()
	defer api.mu.Unlock()
	matched := make([]fakeRequest, 0)
	for _, request := range api.requests {
		if request.Method == method && strings.HasPrefix(request.Path, pathPrefix) {
			matched = append(matched, request)
		}
	}
	return matched
}

func (api *fakeAPI) setRespond(respond func(request fakeRequest) (int, string)) {
	api.mu.Lock()
	defer api.mu.Unlock()
	api.respond = respond
}

// newLocalTestService builds a service on a migrated temp database, signed in
// against api when it is non-nil.
func newLocalTestService(t *testing.T, api *fakeAPI) (*Service, *sql.DB) {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	var runtime *session.Session
	if api != nil {
		server := httptest.NewServer(http.HandlerFunc(api.serve))
		t.Cleanup(server.Close)
		runtime = session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
	}
	svc := newTestService(t, runtime)
	svc.deps.Database = database
	svc.deps.NodeID = "node-1"
	return svc, database
}
