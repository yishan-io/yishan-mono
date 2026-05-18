package daemon

import (
	"context"
	"encoding/json"
)

// dispatch routes a JSON-RPC method call to the appropriate sub-dispatcher.
// Sub-dispatchers are organised by namespace: workspace, git, file, terminal, system.
func (h *JSONRPCHandler) dispatch(ctx context.Context, connState *wsConnState, method string, params json.RawMessage) (any, error) {
	switch {
	case isWorkspaceMethod(method):
		return h.dispatchWorkspace(ctx, connState, method, params)
	case isGitMethod(method):
		return h.dispatchGit(ctx, method, params)
	case isFileMethod(method):
		return h.dispatchFile(ctx, method, params)
	case isTerminalMethod(method):
		return h.dispatchTerminal(ctx, connState, method, params)
	default:
		return h.dispatchSystem(ctx, connState, method, params)
	}
}

func isWorkspaceMethod(method string) bool {
	switch method {
	case MethodOpen, MethodList, MethodWorkspaceCreate, MethodWorkspaceSyncContextLink, MethodWorkspaceClose:
		return true
	}
	return false
}

func isGitMethod(method string) bool {
	switch method {
	case MethodGitStatus, MethodGitInspect, MethodGitListChanges, MethodGitTrack,
		MethodGitUnstage, MethodGitRevert, MethodGitCommit, MethodGitBranchStatus,
		MethodGitBranchPullRequest, MethodGitCommitsToTarget, MethodGitBranchDiffSummary,
		MethodGitCommitDiff, MethodGitBranchDiff, MethodGitBranches, MethodGitPush,
		MethodGitPublish, MethodGitRenameBranch, MethodGitRemoveBranch,
		MethodGitWorktreeCreate, MethodGitWorktreeRemove, MethodGitAuthorName:
		return true
	}
	return false
}

func isFileMethod(method string) bool {
	switch method {
	case MethodFileRead, MethodFileList, MethodFileStat, MethodFileWrite,
		MethodFileDelete, MethodFileMove, MethodFileMkdir, MethodFileDiff:
		return true
	}
	return false
}

func isTerminalMethod(method string) bool {
	switch method {
	case MethodTerminalStart, MethodTerminalSend, MethodTerminalRead, MethodTerminalStop,
		MethodTerminalKillProcess, MethodTerminalListSessions, MethodTerminalListPorts,
		MethodTerminalResize, MethodTerminalSubscribe, MethodTerminalUnsubscribe:
		return true
	}
	return false
}
