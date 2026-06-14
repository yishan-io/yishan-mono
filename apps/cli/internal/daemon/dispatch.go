package daemon

import (
	"context"
	"encoding/json"
)

// dispatch routes a JSON-RPC method call to the appropriate sub-dispatcher.
// Sub-dispatchers are organised by namespace: workspace, git, file, terminal, skill, system.
func (h *JSONRPCHandler) dispatch(ctx context.Context, connState *wsConnState, method string, params json.RawMessage) (any, error) {
	switch {
	case isWorkspaceMethod(method):
		return h.dispatchWorkspace(ctx, connState, method, params)
	case isContextMethod(method):
		return h.dispatchContext(ctx, method, params)
	case isGitMethod(method):
		return h.dispatchGit(ctx, method, params)
	case isFileMethod(method):
		return h.dispatchFile(ctx, method, params)
	case isTerminalMethod(method):
		return h.dispatchTerminal(ctx, connState, method, params)
	case isSkillMethod(method):
		return h.dispatchSkill(ctx, method, params)
	case isMemoryMethod(method):
		return h.dispatchMemory(method, params)
	default:
		return h.dispatchSystem(ctx, connState, method, params)
	}
}

func isWorkspaceMethod(method string) bool {
	switch method {
	case MethodOpen, MethodList, MethodWorkspaceCreate, MethodWorkspaceSyncContextLink, MethodWorkspaceClose, MethodWorkspaceSetActive, MethodWorkspaceRefreshPullRequest:
		return true
	}
	return false
}

func isContextMethod(method string) bool {
	switch method {
	case MethodContextGetState, MethodContextSetCurrentOrg, MethodContextSetActiveProject, MethodContextSetActiveFile:
		return true
	}
	return false
}

func isGitMethod(method string) bool {
	switch method {
	case MethodGitStatus, MethodGitInspect, MethodGitInspectPath, MethodGitListChanges, MethodGitTrack,
		MethodGitUnstage, MethodGitRevert, MethodGitCommit, MethodGitBranchStatus,
		MethodGitBranchPullRequest, MethodGitCommitsToTarget, MethodGitBranchDiffSummary,
		MethodGitCommitDiff, MethodGitBranchDiff, MethodGitBranches, MethodGitPush,
		MethodGitPublish, MethodGitRenameBranch, MethodGitRemoveBranch,
		MethodGitPrMerge, MethodGitPrClose,
		MethodGitWorktreeCreate, MethodGitWorktreeRemove, MethodGitAuthorName:
		return true
	}
	return false
}

func isFileMethod(method string) bool {
	switch method {
	case MethodFileRead, MethodFileList, MethodFileStat, MethodFileWrite,
		MethodFileSearch, MethodFileDelete, MethodFileMove, MethodFileMkdir, MethodFileDiff:
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

func isSkillMethod(method string) bool {
	switch method {
	case MethodSkillList, MethodSkillInstall, MethodSkillUninstall:
		return true
	}
	return false
}

func isMemoryMethod(method string) bool {
	switch method {
	case MethodMemorySearch, MethodMemoryReconcile, MethodMemoryStatus, MethodMemoryUpdateConfig, MethodMemoryGetConfig:
		return true
	}
	return false
}
