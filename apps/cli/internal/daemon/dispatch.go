package daemon

import (
	"context"
	"encoding/json"
	"strings"
)

func (h *JSONRPCHandler) dispatch(ctx context.Context, connState *wsConnState, method string, params json.RawMessage) (any, error) {
	if method == MethodList {
		return h.dispatchWorkspace(ctx, connState, method, params)
	}
	if ns, _, found := strings.Cut(method, "."); found {
		switch ns {
		case "workspace":
			return h.dispatchWorkspace(ctx, connState, method, params)
		case "context":
			return h.dispatchContext(ctx, method, params)
		case "git":
			return h.dispatchGit(ctx, method, params)
		case "file":
			return h.dispatchFile(ctx, method, params)
		case "terminal":
			return h.dispatchTerminal(ctx, connState, method, params)
		case "skill":
			return h.dispatchSkill(ctx, method, params)
		case "memory":
			return h.dispatchMemory(method, params)
		}
	}
	return h.dispatchSystem(ctx, connState, method, params)
}
