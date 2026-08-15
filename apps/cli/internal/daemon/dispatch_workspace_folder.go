package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
)

type workspaceCreateLocalFolderParams struct {
	Path string `json:"path"`
	Name string `json:"name,omitempty"`
}

type workspaceDeleteLocalFolderParams struct {
	ID string `json:"id"`
}

// handleWorkspaceCreateLocalFolder registers a local non-git folder as a
// daemon-owned workspace row. The folder is validated before insertion: it must
// exist, be a directory, must not already be a git repository (folder
// workspaces are strictly non-git), and must not already be tracked.
func (h *JSONRPCHandler) handleWorkspaceCreateLocalFolder(ctx context.Context, params json.RawMessage) (any, error) {
	if h.localDatabase == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "local database is not configured")
	}
	var req workspaceCreateLocalFolderParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	rawPath := strings.TrimSpace(req.Path)
	if rawPath == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "path is required")
	}
	resolvedPath, err := h.validateFolderWorkspacePath(ctx, rawPath)
	if err != nil {
		return nil, err
	}
	store := localdb.NewWorkspaceStore(h.localDatabase)
	created, err := store.CreateFolder(ctx, localdb.FolderWorkspaceInput{
		LocalPath: resolvedPath,
		NodeID:    h.nodeID,
		Name:      req.Name,
	})
	if err != nil {
		// A concurrent create may have raced the GetByPath check below; surface
		// the same "already exists" message the check would have produced.
		if isFolderPathUniqueViolation(err) {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "a workspace already exists for path: "+resolvedPath)
		}
		return nil, err
	}
	stored, err := store.Get(ctx, created.ID)
	if err != nil {
		return nil, err
	}
	return stored, nil
}

// validateFolderWorkspacePath normalizes the raw folder path and verifies it is
// an existing, non-git directory that is not already tracked as a folder
// workspace. It returns the normalized absolute path.
func (h *JSONRPCHandler) validateFolderWorkspacePath(ctx context.Context, rawPath string) (string, error) {
	resolvedPath := normalizeWorkspaceOpenProjectPath(rawPath)
	if resolvedPath == "" {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "path is required")
	}
	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "path does not exist: "+resolvedPath)
	}
	if !info.IsDir() {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "path is not a directory: "+resolvedPath)
	}
	inspect, err := h.manager.GitInspect(ctx, resolvedPath)
	if err != nil {
		return "", err
	}
	if inspect.IsGitRepository {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "path is a git repository; folder workspaces must be non-git")
	}
	store := localdb.NewWorkspaceStore(h.localDatabase)
	if _, err := store.GetByPath(ctx, resolvedPath); err == nil {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "a workspace already exists for path: "+resolvedPath)
	} else if !errors.Is(err, localdb.ErrWorkspaceNotFound) {
		return "", err
	}
	return resolvedPath, nil
}

// isFolderPathUniqueViolation reports whether err stems from the partial unique
// index on folder workspace paths (idx_workspaces_local_folder_path). SQLite
// does not name the index in the violation message, so match on the folder-only
// uniqueness column (local_path), which cannot be hit by any other index in the
// folder-create path.
func isFolderPathUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "unique constraint") && strings.Contains(lower, "local_path")
}

// handleWorkspaceListLocalFolders returns all local-only folder workspaces that
// the daemon has persisted. They are not required to be open in the runtime
// manager; the desktop opens them on demand.
func (h *JSONRPCHandler) handleWorkspaceListLocalFolders(ctx context.Context, _ json.RawMessage) (any, error) {
	if h.localDatabase == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "local database is not configured")
	}
	return localdb.NewWorkspaceStore(h.localDatabase).ListFolders(ctx)
}

// handleWorkspaceDeleteLocalFolder removes a folder workspace row. If the folder
// is currently open in the runtime manager, its terminals are stopped and it is
// unregistered from memory before the row is deleted. Git teardown is not
// performed: folder workspaces are plain directories, not worktrees.
func (h *JSONRPCHandler) handleWorkspaceDeleteLocalFolder(ctx context.Context, params json.RawMessage) (any, error) {
	if h.localDatabase == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "local database is not configured")
	}
	var req workspaceDeleteLocalFolderParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "id is required")
	}
	// If the folder is currently open, stop its terminals and drop it from the
	// manager so no live handle survives deletion. Mirror the workspace-close
	// teardown so no filesystem watcher or pull-request tracker entry leaks and
	// keeps polling a deleted folder.
	if ws, err := h.getWorkspace(req.ID); err == nil {
		h.manager.Terminals().StopAllForWorkspace(req.ID)
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(req.ID)
		h.manager.Instances().Remove(req.ID)
	}
	// Mirror the workspace-close teardown: summarize and clear any agent usage
	// recorded against the folder before its row is deleted, so no in-flight
	// usage is lost and no stale usage survives the delete.
	h.summarizeUsedAgents(req.ID, workspace.CloseRequest{WorkspaceID: req.ID})
	h.clearAgentUsage(req.ID)
	if err := localdb.NewWorkspaceStore(h.localDatabase).Delete(ctx, req.ID); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true}, nil
}
