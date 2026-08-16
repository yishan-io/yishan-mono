package rpc

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
)

// Router dispatches JSON-RPC methods to namespace handlers. A dotted method
// ("workspace.create") routes to the handler registered for its namespace; a
// bare method ("list") routes to the handler registered under the exact
// method name; anything else falls through to the "system" handler.
type Router struct {
	mu       sync.RWMutex
	handlers map[string]Handler
}

// NewRouter creates an empty router.
func NewRouter() *Router {
	return &Router{handlers: make(map[string]Handler)}
}

// Register binds a namespace (or bare method name) to a handler.
func (r *Router) Register(namespace string, handler Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.handlers[namespace] = handler
}

// Call implements Handler: it routes the method and invokes the target
// handler.
func (r *Router) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	r.mu.RLock()
	handler := r.route(method)
	r.mu.RUnlock()
	if handler == nil {
		return nil, NewRPCError(CodeMethodNotFound, "method not found: "+method)
	}
	return handler.Call(ctx, connection, method, params)
}

func (r *Router) route(method string) Handler {
	if ns, _, found := strings.Cut(method, "."); found {
		if handler, ok := r.handlers[ns]; ok {
			return handler
		}
	} else if handler, ok := r.handlers[method]; ok {
		return handler
	}
	return r.handlers["system"]
}
