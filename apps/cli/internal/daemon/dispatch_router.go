package daemon

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/rpc"
)

// buildNamespaceRouter wires the JSON-RPC namespace routing table. Each
// namespace has one transport owner: the rpc namespace handlers own decoding
// and call exactly one typed service method; the daemon implements the
// services. The agent namespaces (pi/skill/customize) remain thin daemon
// adapters until Phase 10 forms the agent domain.
func buildNamespaceRouter(h *JSONRPCHandler) *rpc.Router {
	router := rpc.NewRouter()
	router.Register("list", &rpc.WorkspaceHandler{Services: h})
	router.Register("workspace", &rpc.WorkspaceHandler{Services: h})
	router.Register("context", &rpc.ContextHandler{Services: h})
	router.Register("git", &rpc.GitHandler{Services: h})
	router.Register("file", &rpc.FileHandler{Services: h})
	router.Register("terminal", &rpc.TerminalHandler{Services: h})
	router.Register("computer", &rpc.ComputerHandler{Services: h})
	router.Register("memory", &rpc.MemoryHandler{Services: h})
	router.Register("project", &rpc.ProjectHandler{Services: h})
	router.Register("system", &rpc.SystemHandler{Services: h})

	// Agent namespaces stay as daemon dispatch adapters (Phase 10).
	router.Register("skill", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchSkill(ctx, method, params)
	}))
	router.Register("customize", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchCustomize(ctx, method, params)
	}))
	router.Register("pi", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchPi(ctx, conn, method, params)
	}))
	return router
}
