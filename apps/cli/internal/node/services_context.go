package node

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
	"yishan/apps/cli/internal/workspace"
)

// ContextService implementation: each method reads or updates the renderer
// context store.

func (s *Services) ContextGetState() (any, error) {
	return s.context.GetState(), nil
}

func (s *Services) ContextSetCurrentOrg(ctx context.Context, req rpc.ContextSetCurrentOrgParams) (any, error) {
	orgID := strings.TrimSpace(req.OrgID)
	if orgID == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "orgId is required")
	}
	if err := s.context.SetCurrentOrg(orgID); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ContextSetActiveProject(ctx context.Context, req rpc.ContextSetActiveProjectParams) (any, error) {
	s.context.SetActiveProject(strings.TrimSpace(req.ProjectID))
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ContextSetActiveFile(ctx context.Context, req rpc.ContextSetActiveFileParams) (any, error) {
	s.context.SetActiveFile(strings.TrimSpace(req.FilePath))
	return map[string]bool{"ok": true}, nil
}
