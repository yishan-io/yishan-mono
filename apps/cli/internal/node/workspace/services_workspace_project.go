package workspace

import (
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
func (s *Service) openProjectWorkspace(entry rpc.WorkspaceOpenProjectEntry) (string, bool, error) {
	workspaceID := strings.TrimSpace(entry.WorkspaceID)
	workspacePath := strings.TrimSpace(entry.WorktreePath)
	if workspaceID == "" || workspacePath == "" {
		return "", false, fmt.Errorf("missing workspaceId or worktreePath")
	}
	if existingWorkspace, err := s.GetWorkspace(workspaceID); err == nil {
		if shouldSkipWorkspaceOpenProject(existingWorkspace, entry) {
			// The workspace is already open (for example restored from the local
			// DB at daemon boot). Watch registration is idempotent per worktree
			// path, so ensure the filesystem watcher exists even on the skip
			// path; otherwise file-change events never flow for this workspace.
			if existingWorkspace.State == workspace.StateActive && strings.TrimSpace(existingWorkspace.Path) != "" {
				s.WatchAndTrack(existingWorkspace)
			}
			return workspaceID, false, nil
		}
		if workspaceOpenProjectKind(entry.Kind) == workspace.KindFolder && existingWorkspace.Kind != workspace.KindFolder {
			if err := s.stopGitMonitoringForFolder(existingWorkspace); err != nil {
				return workspaceID, false, err
			}
		}
	}
	openedWorkspace, err := s.Open(workspace.OpenRequest{
		ID:        workspaceID,
		Path:      workspacePath,
		ProjectID: entry.ProjectID,
		OrgID:     entry.OrgID,
		Kind:      workspaceOpenProjectKind(entry.Kind),
	})
	if err != nil {
		return workspaceID, false, err
	}
	s.WatchAndTrack(openedWorkspace)
	return openedWorkspace.ID, true, nil
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
	if strings.TrimSpace(kind) == string(workspace.KindFolder) {
		return workspace.KindFolder
	}
	return workspace.KindWorktree
}
