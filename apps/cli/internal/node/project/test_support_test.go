package project

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"testing"

	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"
)

// newTestService builds a project application service for tests with a router
// wired for the project namespace.
func newTestService(t *testing.T, runtime *cliruntime.Runtime) *Service {
	t.Helper()
	svc := NewService(Deps{Runtime: runtime})
	router := rpc.NewRouter()
	router.Register("project", &rpc.ProjectHandler{Services: svc})
	svc.router = router
	return svc
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
