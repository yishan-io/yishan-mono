package workspace

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func normalizeWorkspaceOpenProjectPath(path string) string {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return ""
	}
	absolutePath, err := filepath.Abs(trimmedPath)
	if err != nil {
		return filepath.Clean(trimmedPath)
	}
	resolvedPath, err := filepath.EvalSymlinks(absolutePath)
	if err == nil {
		return resolvedPath
	}
	return filepath.Clean(absolutePath)
}

func shouldSkipWorkspaceOpenProject(existing workspace.Workspace, entry rpc.WorkspaceOpenProjectEntry) bool {
	entryKind := workspaceOpenProjectKind(entry.Kind)
	isSameWorkspace := strings.TrimSpace(existing.ID) == strings.TrimSpace(entry.WorkspaceID) &&
		normalizeWorkspaceOpenProjectPath(existing.Path) == normalizeWorkspaceOpenProjectPath(entry.WorktreePath)
	if existing.Kind == workspace.KindFolder || entryKind == workspace.KindFolder {
		// Folders are local and org-independent. Their initial create payload has
		// no org ID, while a later snapshot carries the selected organization.
		return isSameWorkspace && existing.Kind == workspace.KindFolder && entryKind == workspace.KindFolder
	}
	return isSameWorkspace &&
		strings.TrimSpace(existing.ProjectID) == strings.TrimSpace(entry.ProjectID) &&
		strings.TrimSpace(existing.OrgID) == strings.TrimSpace(entry.OrgID)
}

// openProjectWorkspace opens one entry from a workspace.openProject request.
// Returns the workspace id, whether it was newly opened, and any error.
func (s *Service) openProjectWorkspace(ctx context.Context, entry rpc.WorkspaceOpenProjectEntry) (string, bool, error) {
	workspaceID := strings.TrimSpace(entry.WorkspaceID)
	workspacePath := strings.TrimSpace(entry.WorktreePath)
	if workspaceID == "" || workspacePath == "" {
		return "", false, fmt.Errorf("missing workspaceId or worktreePath")
	}
	openedWorkspace, didOpen, err := s.reconcileProjectWorkspace(ctx, entry)
	if err != nil {
		return workspaceID, false, err
	}
	// Availability callbacks must not extend the path claim.
	if didOpen && s.deps.WorkspaceAvailabilityChanged != nil {
		s.deps.WorkspaceAvailabilityChanged()
	}
	return openedWorkspace.ID, didOpen, nil
}

// reconcileProjectWorkspace holds an operation-scoped claim through the fresh
// read, validation, ownership checks, persistence, runtime registration and monitoring.
// Legacy Open/create do not participate; this is not a global reservation.
func (s *Service) reconcileProjectWorkspace(ctx context.Context, entry rpc.WorkspaceOpenProjectEntry) (workspace.Workspace, bool, error) {
	s.openProjectMu.Lock()
	defer s.openProjectMu.Unlock()
	if err := ctx.Err(); err != nil {
		return workspace.Workspace{}, false, err
	}
	opened, err := s.GetWorkspace(strings.TrimSpace(entry.WorkspaceID))
	didOpen := false
	if err != nil || !shouldSkipWorkspaceOpenProject(opened, entry) {
		opened, err = s.reopenProjectWorkspace(ctx, entry)
		didOpen = err == nil
	}
	if err == nil && opened.State == workspace.StateActive && strings.TrimSpace(opened.Path) != "" {
		s.WatchAndTrack(opened)
	}
	return opened, didOpen, err
}

// reopenProjectWorkspace validates and persists before replacing any runtime state.
func (s *Service) reopenProjectWorkspace(ctx context.Context, entry rpc.WorkspaceOpenProjectEntry) (workspace.Workspace, error) {
	req := workspace.OpenRequest{ID: strings.TrimSpace(entry.WorkspaceID), Path: strings.TrimSpace(entry.WorktreePath),
		ProjectID: entry.ProjectID, OrgID: entry.OrgID, Kind: workspaceOpenProjectKind(entry.Kind)}
	existing, hasExisting := s.deps.Registry.Get(req.ID)
	if hasExisting && req.Kind != workspace.KindFolder {
		req.Kind = existing.Kind
	}
	absPath, err := validateWorkspaceOpen(req)
	if err != nil {
		return workspace.Workspace{}, err
	}
	if err := s.reconcileOpenedProjectIdentity(ctx, &req, absPath); err != nil {
		return workspace.Workspace{}, err
	}
	if err := s.persistOpenedProjectPath(ctx, req.ID, absPath); err != nil {
		return workspace.Workspace{}, err
	}
	if hasExisting {
		if req.Kind == workspace.KindFolder && existing.Kind != workspace.KindFolder {
			if err := s.stopGitMonitoringForFolder(existing); err != nil {
				return workspace.Workspace{}, err
			}
		} else if existing.Path != absPath {
			if s.deps.Watchers != nil {
				s.deps.Watchers.Unwatch(existing.Path)
			}
			if s.deps.PRTracker != nil {
				s.deps.PRTracker.StopTracking(existing.ID)
			}
		}
	}
	return s.registerOpenWorkspaceState(req, absPath), nil
}

// stopGitMonitoringForFolder tears down Git-specific runtime state before a
// legacy workspace is replaced by a local folder workspace.
func (s *Service) stopGitMonitoringForFolder(existing workspace.Workspace) error {
	s.deps.Watchers.Unwatch(existing.Path)
	s.deps.PRTracker.StopTracking(existing.ID)
	if err := s.deps.Registry.SetPullRequest(existing.ID, nil); err != nil {
		return fmt.Errorf("clear pull request state for folder workspace: %w", err)
	}
	return nil
}

// workspaceOpenProjectKind maps the wire kind to the supported runtime kinds.
// Unknown and absent kinds retain the historic Git-workspace behavior.
func workspaceOpenProjectKind(kind string) workspace.Kind {
	if strings.TrimSpace(kind) == string(workspace.KindPrimary) {
		return workspace.KindPrimary
	}
	if strings.TrimSpace(kind) == string(workspace.KindFolder) {
		return workspace.KindFolder
	}
	return workspace.KindWorktree
}
