package workspace

import (
	"context"
	"errors"
	"os"
	"strings"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// ImportLocalPath classifies and imports one local directory. Git directories
// are returned for backend project creation. Non-git directories are persisted
// as daemon-local folders. Classification happens exactly once per import.
func (s *Service) ImportLocalPath(ctx context.Context, req rpc.WorkspaceImportLocalPathParams) (any, error) {
	if s.deps.Database == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "local database is not configured")
	}
	resolvedPath, err := s.validateLocalPath(req.Path)
	if err != nil {
		return nil, err
	}
	inspect, err := s.inspectLocalPath(ctx, resolvedPath)
	if err != nil {
		return nil, err
	}
	if inspect.IsGitRepository {
		return rpc.WorkspaceImportLocalPathResult{
			Kind: "git", RemoteURL: inspect.RemoteURL, CurrentBranch: inspect.CurrentBranch,
		}, nil
	}
	store := sqlite.NewWorkspaceStore(s.deps.Database)
	if _, err := store.GetByPath(ctx, resolvedPath); err == nil {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "a workspace already exists for path: "+resolvedPath)
	} else if !errors.Is(err, sqlite.ErrWorkspaceNotFound) {
		return nil, err
	}
	created, err := store.CreateFolder(ctx, sqlite.FolderWorkspaceInput{LocalPath: resolvedPath, NodeID: s.deps.NodeID, Name: req.Name})
	if err != nil {
		if isFolderPathUniqueViolation(err) {
			return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "a workspace already exists for path: "+resolvedPath)
		}
		return nil, err
	}
	stored, err := store.Get(ctx, created.ID)
	if err != nil {
		return nil, err
	}
	return rpc.WorkspaceImportLocalPathResult{Kind: "folder", Folder: &rpc.WorkspaceImportLocalPathFolder{
		ID: stored.ID, LocalPath: stored.LocalPath, Name: stored.Name, State: stored.State, Health: stored.Health,
	}}, nil
}

func (s *Service) inspectLocalPath(ctx context.Context, path string) (git.GitInspectResult, error) {
	if s.deps.InspectLocalPath != nil {
		return s.deps.InspectLocalPath(ctx, path)
	}
	return s.deps.Git.Inspect(ctx, path)
}

// validateLocalPath normalizes the raw folder path and verifies it is an
// existing directory. Git classification belongs to ImportLocalPath so a
// create flow cannot inspect the path more than once.
func (s *Service) validateLocalPath(rawPath string) (string, error) {
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
	return sqlite.NewWorkspaceStore(s.deps.Database).ListFolders(ctx)
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
	if err := sqlite.NewWorkspaceStore(s.deps.Database).Delete(ctx, req.ID); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true}, nil
}
