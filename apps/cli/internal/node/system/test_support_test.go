package system

import (
	"context"
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/rpc"
)

// newTestHandler builds a system application service for tests with a router
// wired for the system/memory/computer/context namespaces.
func newTestHandler(t *testing.T) *Service {
	t.Helper()
	svc := NewService(Deps{
		Computer: computer.NewService(computer.NewUnavailableRuntime("unknown")),
	})
	router := rpc.NewRouter()
	router.Register("context", &rpc.ContextHandler{Services: svc})
	router.Register("computer", &rpc.ComputerHandler{Services: svc})
	router.Register("memory", &rpc.MemoryHandler{Services: svc})
	router.Register("system", &rpc.SystemHandler{Services: svc})
	svc.router = router
	return svc
}

// callRPCForTest routes a method+params through the namespace router, the
// same path rpc.Server uses for live connections.
func (s *Service) callRPCForTest(ctx context.Context, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, &rpc.Connection{}, method, params)
}
