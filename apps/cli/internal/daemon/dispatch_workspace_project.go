package daemon

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
	return normalizeWorkspaceOpenProjectPath(existing.Path) == normalizeWorkspaceOpenProjectPath(entry.WorktreePath) &&
		strings.TrimSpace(existing.ProjectID) == strings.TrimSpace(entry.ProjectID) &&
		strings.TrimSpace(existing.OrgID) == strings.TrimSpace(entry.OrgID)
}

// openProjectWorkspace opens one entry from a workspace.openProject request.
// Returns the workspace id, whether it was newly opened, and any error.
func (h *JSONRPCHandler) openProjectWorkspace(entry rpc.WorkspaceOpenProjectEntry) (string, bool, error) {
	workspaceID := strings.TrimSpace(entry.WorkspaceID)
	workspacePath := strings.TrimSpace(entry.WorktreePath)
	if workspaceID == "" || workspacePath == "" {
		return "", false, fmt.Errorf("missing workspaceId or worktreePath")
	}
	if existingWorkspace, err := h.getWorkspace(workspaceID); err == nil {
		if shouldSkipWorkspaceOpenProject(existingWorkspace, entry) {
			// The workspace is already open (for example restored from the local
			// DB at daemon boot). Watch registration is idempotent per worktree
			// path, so ensure the filesystem watcher exists even on the skip
			// path; otherwise file-change events never flow for this workspace.
			if existingWorkspace.State == workspace.StateActive && strings.TrimSpace(existingWorkspace.Path) != "" {
				h.nodeApp.WatchAndTrack(existingWorkspace.ID, existingWorkspace.Path)
			}
			return workspaceID, false, nil
		}
	}
	openedWorkspace, err := h.manager.Open(workspace.OpenRequest{
		ID:        workspaceID,
		Path:      workspacePath,
		ProjectID: entry.ProjectID,
		OrgID:     entry.OrgID,
	})
	if err != nil {
		return workspaceID, false, err
	}
	h.nodeApp.WatchAndTrack(openedWorkspace.ID, openedWorkspace.Path)
	return openedWorkspace.ID, true, nil
}
