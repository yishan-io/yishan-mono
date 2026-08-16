package workspace

import (
	"context"
	"errors"
	"os"
	"strings"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// WorkspaceCreateLocalFolder registers a local non-git folder as a
// daemon-owned workspace row. The folder is validated before insertion: it must
// exist, be a directory, must not already be a git repository (folder
// workspaces are strictly non-git), and must not already be tracked.
func (s *Service) CreateLocalFolder(ctx context.Context, req rpc.WorkspaceCreateLocalFolderParams) (any, error) {
	if s.deps.Database == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "local database is not configured")
	}
	rawPath := strings.TrimSpace(req.Path)
	if rawPath == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "path is required")
	}
	resolvedPath, err := s.validateFolderPath(ctx, rawPath)
	if err != nil {
		return nil, err
	}
	store := localdb.NewWorkspaceStore(s.deps.Database)
	created, err := store.CreateFolder(ctx, localdb.FolderWorkspaceInput{
		LocalPath: resolvedPath,
		NodeID:    s.deps.NodeID,
		Name:      req.Name,
	})
	if err != nil {
		// A concurrent create may have raced the GetByPath check below; surface
		// the same "already exists" message the check would have produced.
		if isFolderPathUniqueViolation(err) {
			return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "a workspace already exists for path: "+resolvedPath)
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
func (s *Service) validateFolderPath(ctx context.Context, rawPath string) (string, error) {
	resolvedPath := normalizeWorkspaceOpenProjectPath(rawPath)
	if resolvedPath == "" {
		return "", rpc.NewRPCError(rpc.CodeInvalidParams, "path is required")
	}
	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", rpc.NewRPCError(rpc.CodeInvalidParams, "path does not exist: "+resolvedPath)
	}
	if !info.IsDir() {
		return "", rpc.NewRPCError(rpc.CodeInvalidParams, "path is not a directory: "+resolvedPath)
	}
	inspect, err := s.deps.Git.Inspect(ctx, resolvedPath)
	if err != nil {
		return "", err
	}
	if inspect.IsGitRepository {
		return "", rpc.NewRPCError(rpc.CodeInvalidParams, "path is a git repository; folder workspaces must be non-git")
	}
	store := localdb.NewWorkspaceStore(s.deps.Database)
	if _, err := store.GetByPath(ctx, resolvedPath); err == nil {
		return "", rpc.NewRPCError(rpc.CodeInvalidParams, "a workspace already exists for path: "+resolvedPath)
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

// WorkspaceListLocalFolders returns all local-only folder workspaces that
// the daemon has persisted. They are not required to be open in the runtime
// manager; the desktop opens them on demand.
func (s *Service) ListLocalFolders(ctx context.Context) (any, error) {
	if s.deps.Database == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "local database is not configured")
	}
	return localdb.NewWorkspaceStore(s.deps.Database).ListFolders(ctx)
}

// WorkspaceDeleteLocalFolder removes a folder workspace row. If the folder
// is currently open in the runtime manager, its terminals are stopped and it is
// unregistered from memory before the row is deleted. Git teardown is not
// performed: folder workspaces are plain directories, not worktrees.
func (s *Service) DeleteLocalFolder(ctx context.Context, req rpc.WorkspaceDeleteLocalFolderParams) (any, error) {
	if s.deps.Database == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "local database is not configured")
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "id is required")
	}
	// If the folder is currently open, stop its terminals and drop it from the
	// manager so no live handle survives deletion. Mirror the workspace-close
	// teardown so no filesystem watcher or pull-request tracker entry leaks and
	// keeps polling a deleted folder.
	if ws, err := s.GetWorkspace(req.ID); err == nil {
		s.deps.Terminals.StopAllForWorkspace(req.ID)
		s.deps.Watchers.Unwatch(ws.Path)
		s.deps.PRTracker.StopTracking(req.ID)
		s.deps.Registry.Remove(req.ID)
	}
	// Mirror the workspace-close teardown: summarize and clear any agent usage
	// recorded against the folder before its row is deleted, so no in-flight
	// usage is lost and no stale usage survives the delete.
	s.summarizeUsedAgents(req.ID, workspace.CloseRequest{WorkspaceID: req.ID})
	s.clearAgentUsage(req.ID)
	if err := localdb.NewWorkspaceStore(s.deps.Database).Delete(ctx, req.ID); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true}, nil
}
