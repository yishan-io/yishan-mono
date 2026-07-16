package createflow

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/workspace"
)

type CleanupDependencies struct {
	Unwatch                   func(path string)
	StopTracking              func(workspaceID string)
	RegisterCleanup           func(workspace.ClosePathRequest) error
	CloseWorkspacePath        func(context.Context, workspace.ClosePathRequest) error
	MarkCleanupFailure        func(workspaceID string, cleanupErr error) error
	RemoveRegisteredCleanup   func(workspaceID string) error
	RemoveWorkspaceFromMemory func(workspaceID string)
	RemoveWorkspaceIndex      func(workspaceID string) error
	ClearAgentUsage           func(workspaceID string)
	Warn                      func(workspaceID string, path string, message string, err error)
}

func BuildCreateFailureClosePathRequest(created workspace.Workspace, targetBranch string) workspace.ClosePathRequest {
	return workspace.ClosePathRequest{
		WorkspaceID:   created.ID,
		Path:          created.Path,
		Branch:        targetBranch,
		RemoveBranch:  true,
		ForceWorktree: true,
		ForceBranch:   true,
	}
}

func CleanupLocalWorkspaceCreateFailure(ctx context.Context, deps CleanupDependencies, closeReq workspace.ClosePathRequest) {
	if strings.TrimSpace(closeReq.Path) == "" {
		return
	}

	if deps.Unwatch != nil {
		deps.Unwatch(closeReq.Path)
	}
	if deps.StopTracking != nil {
		deps.StopTracking(closeReq.WorkspaceID)
	}

	if deps.RegisterCleanup != nil {
		if err := deps.RegisterCleanup(closeReq); err != nil && deps.Warn != nil {
			deps.Warn(closeReq.WorkspaceID, closeReq.Path, "failed to register workspace create rollback cleanup", err)
		}
	}

	if deps.CloseWorkspacePath != nil {
		if err := deps.CloseWorkspacePath(ctx, closeReq); err != nil {
			if deps.MarkCleanupFailure != nil {
				if markErr := deps.MarkCleanupFailure(closeReq.WorkspaceID, err); markErr != nil && deps.Warn != nil {
					deps.Warn(closeReq.WorkspaceID, closeReq.Path, "failed to mark workspace create rollback cleanup failure", markErr)
				}
			}
			if deps.Warn != nil {
				deps.Warn(closeReq.WorkspaceID, closeReq.Path, "workspace create rollback cleanup failed", err)
			}
		} else if deps.RemoveRegisteredCleanup != nil {
			if err := deps.RemoveRegisteredCleanup(closeReq.WorkspaceID); err != nil && deps.Warn != nil {
				deps.Warn(closeReq.WorkspaceID, closeReq.Path, "failed to remove completed workspace create rollback cleanup", err)
			}
		}
	}

	if deps.RemoveWorkspaceFromMemory != nil {
		deps.RemoveWorkspaceFromMemory(closeReq.WorkspaceID)
	}
	if deps.RemoveWorkspaceIndex != nil {
		if err := deps.RemoveWorkspaceIndex(closeReq.WorkspaceID); err != nil && deps.Warn != nil {
			deps.Warn(closeReq.WorkspaceID, closeReq.Path, "failed to remove rolled back workspace from index store", err)
		}
	}
	if deps.ClearAgentUsage != nil {
		deps.ClearAgentUsage(closeReq.WorkspaceID)
	}
}
