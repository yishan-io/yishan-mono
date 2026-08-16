package node

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/rpc"
)

// ContextService implementation: each method reads or updates the renderer
// context store.

func (s *Service) ContextGetState() (any, error) {
	return s.deps.ContextStore.GetState(), nil
}

func (s *Service) ContextSetCurrentOrg(ctx context.Context, req rpc.ContextSetCurrentOrgParams) (any, error) {
	orgID := strings.TrimSpace(req.OrgID)
	if orgID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "orgId is required")
	}
	if err := s.deps.ContextStore.SetCurrentOrg(orgID); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) ContextSetActiveProject(ctx context.Context, req rpc.ContextSetActiveProjectParams) (any, error) {
	s.deps.ContextStore.SetActiveProject(strings.TrimSpace(req.ProjectID))
	return map[string]bool{"ok": true}, nil
}

func (s *Service) ContextSetActiveFile(ctx context.Context, req rpc.ContextSetActiveFileParams) (any, error) {
	s.deps.ContextStore.SetActiveFile(strings.TrimSpace(req.FilePath))
	return map[string]bool{"ok": true}, nil
}
