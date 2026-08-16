package system

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/rpc"
)

// ContextService implementation: each method reads or updates the renderer
// context store.

func (s *Service) GetState() (any, error) {
	return s.deps.ContextStore.GetState(), nil
}

func (s *Service) SetCurrentOrg(ctx context.Context, req rpc.ContextSetCurrentOrgParams) (any, error) {
	orgID := strings.TrimSpace(req.OrgID)
	if orgID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "orgId is required")
	}
	if err := s.deps.ContextStore.SetCurrentOrg(orgID); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) SetActiveProject(ctx context.Context, req rpc.ContextSetActiveProjectParams) (any, error) {
	s.deps.ContextStore.SetActiveProject(strings.TrimSpace(req.ProjectID))
	return map[string]bool{"ok": true}, nil
}

func (s *Service) SetActiveFile(ctx context.Context, req rpc.ContextSetActiveFileParams) (any, error) {
	s.deps.ContextStore.SetActiveFile(strings.TrimSpace(req.FilePath))
	return map[string]bool{"ok": true}, nil
}
