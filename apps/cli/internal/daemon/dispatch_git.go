package daemon

import (
	"context"
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/workspace"
)

// gitWorkspaceRefParams is the minimal request shape shared by git.* methods
// that target a workspace by ID, used by the non-git capability guard.
type gitWorkspaceRefParams struct {
	WorkspaceID string `json:"workspaceId"`
}

// guardGitProjectCapability rejects git.* methods for workspaces whose project
// is non-git (sourceType "unknown"). git.inspectPath is exempt: it is
// path-based and the desktop uses it to classify a folder before a project
// exists. Workspaces without a resolvable project association pass through so
// the per-method handlers keep surfacing their normal errors.
func (h *JSONRPCHandler) guardGitProjectCapability(ctx context.Context, params json.RawMessage) error {
	var req gitWorkspaceRefParams
	if err := decodeParams(params, &req); err != nil {
		return nil
	}
	workspaceID := strings.TrimSpace(req.WorkspaceID)
	if workspaceID == "" {
		return nil
	}
	ws, err := h.manager.GetWorkspace(workspaceID)
	if err != nil {
		return err
	}
	projectID := strings.TrimSpace(ws.ProjectID)
	if projectID == "" || h.localDatabase == nil {
		return nil
	}
	project, err := h.projectStore().Get(ctx, projectID)
	if err != nil {
		// Unresolvable project record: do not block on lookup failures.
		return nil
	}
	if project.SourceType == "unknown" {
		return workspace.NewRPCError(rpcCodeInvalidParams, "project is not a git repository — git operations are unavailable")
	}
	return nil
}

func (h *JSONRPCHandler) dispatchGit(ctx context.Context, method string, params json.RawMessage) (any, error) {
	if method != MethodGitInspectPath {
		if err := h.guardGitProjectCapability(ctx, params); err != nil {
			return nil, err
		}
	}
	switch method {
	case MethodGitStatus:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitStatus(ctx)
	case MethodGitInspect:
		var req gitInspectParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitInspect(ctx)
	case MethodGitInspectPath:
		var req gitInspectPathParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitInspect(ctx, req.Path)
	case MethodGitListChanges:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitListChanges(ctx)
	case MethodGitTrack:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.GitTrackChanges(ctx, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"tracked": true}, nil
	case MethodGitUnstage:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.GitUnstageChanges(ctx, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"unstaged": true}, nil
	case MethodGitRevert:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.GitRevertChanges(ctx, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"reverted": true}, nil
	case MethodGitCommit:
		var req gitCommitParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitCommitChanges(ctx, req.Message, req.Amend, req.Signoff)
	case MethodGitBranchStatus:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitBranchStatus(ctx)
	case MethodGitBranchPullRequest:
		var req gitBranchPullRequestParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitBranchPullRequest(ctx, req.Branch)
	case MethodGitCommitsToTarget:
		var req gitTargetBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitListCommitsToTarget(ctx, req.TargetBranch)
	case MethodGitBranchDiffSummary:
		var req gitTargetBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitBranchDiffSummary(ctx, req.TargetBranch)
	case MethodGitCommitDiff:
		var req gitCommitDiffParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitReadCommitDiff(ctx, req.CommitHash, req.Path)
	case MethodGitBranchDiff:
		var req gitBranchDiffParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitReadBranchComparisonDiff(ctx, req.TargetBranch, req.Path)
	case MethodGitBranches:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitListBranches(ctx)
	case MethodGitPush:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitPushBranch(ctx)
	case MethodGitPublish:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitPublishBranch(ctx)
	case MethodGitRenameBranch:
		var req gitRenameBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.GitRenameBranch(ctx, req.NextBranch); err != nil {
			return nil, err
		}
		return map[string]bool{"renamed": true}, nil
	case MethodGitRemoveBranch:
		var req gitRemoveBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.GitRemoveBranch(ctx, req.Branch, req.Force); err != nil {
			return nil, err
		}
		return map[string]bool{"removed": true}, nil
	case MethodGitPrMerge:
		var req gitPrMergeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		out, err := handle.GitPrMerge(ctx, req.PrNumber, req.Method, req.DeleteBranch)
		if err != nil {
			return nil, err
		}
		return map[string]string{"output": out}, nil
	case MethodGitPrClose:
		var req gitPrCloseParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		out, err := handle.GitPrClose(ctx, req.PrNumber)
		if err != nil {
			return nil, err
		}
		return map[string]string{"output": out}, nil
	case MethodGitWorktreeCreate:
		var req gitCreateWorktreeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.GitCreateWorktree(ctx, req.Branch, req.WorktreePath, req.CreateBranch, req.FromRef); err != nil {
			return nil, err
		}
		return map[string]bool{"created": true}, nil
	case MethodGitWorktreeRemove:
		var req gitRemoveWorktreeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.GitRemoveWorktree(ctx, req.WorktreePath, req.Force); err != nil {
			return nil, err
		}
		return map[string]bool{"removed": true}, nil
	case MethodGitAuthorName:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.GitAuthorName(ctx)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown git method: "+method)
	}
}
