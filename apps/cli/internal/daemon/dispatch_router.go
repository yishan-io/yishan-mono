package daemon

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/rpc"
)

// buildNamespaceRouter wires the JSON-RPC namespace routing table onto the
// handler's dispatch methods. Each namespace handler is a thin adapter: it
// decodes nothing (the dispatch methods do) and constructs no services.
func buildNamespaceRouter(h *JSONRPCHandler) *rpc.Router {
	router := rpc.NewRouter()
	router.Register("list", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchWorkspace(ctx, conn, method, params)
	}))
	router.Register("workspace", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchWorkspace(ctx, conn, method, params)
	}))
	router.Register("context", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchContext(ctx, method, params)
	}))
	router.Register("git", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchGit(ctx, method, params)
	}))
	router.Register("file", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchFile(ctx, method, params)
	}))
	router.Register("terminal", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchTerminal(ctx, conn, method, params)
	}))
	router.Register("computer", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchComputer(ctx, method, params)
	}))
	router.Register("skill", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchSkill(ctx, method, params)
	}))
	router.Register("customize", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchCustomize(ctx, method, params)
	}))
	router.Register("memory", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchMemory(method, params)
	}))
	router.Register("project", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchProject(ctx, method, params)
	}))
	router.Register("pi", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchPi(ctx, conn, method, params)
	}))
	router.Register("system", rpc.HandlerFunc(func(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
		return h.dispatchSystem(ctx, conn, method, params)
	}))
	return router
}
