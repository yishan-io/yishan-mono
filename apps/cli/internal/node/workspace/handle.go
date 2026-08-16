package workspace

import (
	"yishan/apps/cli/internal/rpc"
	domain "yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

// handleForInstance builds a workspace-scoped handle from the instance
// registry and the manager's shared services (file cache, git, terminals).
func (s *Service) handleForInstance(ws domain.Workspace) instance.Handle {
	return instance.NewHandle(ws, s.deps.Files, s.deps.Git, s.deps.Terminals)
}

// handleFor resolves a workspace-scoped handle from the instance registry.
func (s *Service) handleFor(workspaceID string) (instance.Handle, error) {
	ws, ok := s.deps.Registry.Get(workspaceID)
	if !ok {
		return instance.Handle{}, notFound()
	}
	return s.handleForInstance(ws), nil
}

// handleForPath resolves the canonical path and builds the handle for the
// instance at that path.
func (s *Service) handleForPath(path string) (instance.Handle, error) {
	ws, ok := s.deps.Registry.GetByPath(path)
	if !ok {
		return instance.Handle{}, notFound()
	}
	return s.handleForInstance(ws), nil
}

// getWorkspace returns the open instance for a workspace id, mapping a missing
// instance to the RPC not-found error (instance reads go through the registry).
func (s *Service) getWorkspace(workspaceID string) (domain.Workspace, error) {
	ws, ok := s.deps.Registry.Get(workspaceID)
	if !ok {
		return domain.Workspace{}, notFound()
	}
	return ws, nil
}

func notFound() error {
	return rpc.NewRPCError(rpc.CodeNotFound, "workspace not found")
}
