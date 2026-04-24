package daemon

const (
	MethodDaemonPing = "daemon.ping"

	MethodOpen = "open"
	MethodList = "list"

	MethodFileRead   = "file.read"
	MethodFileList   = "file.list"
	MethodFileStat   = "file.stat"
	MethodFileWrite  = "file.write"
	MethodFileDelete = "file.delete"
	MethodFileMove   = "file.move"
	MethodFileMkdir  = "file.mkdir"
	MethodFileDiff   = "file.diff"

	MethodGitStatus          = "git.status"
	MethodGitInspect         = "git.inspect"
	MethodGitListChanges     = "git.listChanges"
	MethodGitTrack           = "git.track"
	MethodGitUnstage         = "git.unstage"
	MethodGitRevert          = "git.revert"
	MethodGitCommit          = "git.commit"
	MethodGitBranchStatus    = "git.branchStatus"
	MethodGitCommitsToTarget = "git.commitsToTarget"
	MethodGitCommitDiff      = "git.commitDiff"
	MethodGitBranchDiff      = "git.branchDiff"
	MethodGitBranches        = "git.branches"
	MethodGitPush            = "git.push"
	MethodGitPublish         = "git.publish"
	MethodGitRenameBranch    = "git.renameBranch"
	MethodGitRemoveBranch    = "git.removeBranch"

	MethodGitWorktreeCreate = "git.worktree.create"
	MethodGitWorktreeRemove = "git.worktree.remove"
	MethodGitAuthorName     = "git.authorName"

	MethodTerminalStart       = "terminal.start"
	MethodTerminalSend        = "terminal.send"
	MethodTerminalRead        = "terminal.read"
	MethodTerminalStop        = "terminal.stop"
	MethodTerminalResize      = "terminal.resize"
	MethodTerminalSubscribe   = "terminal.subscribe"
	MethodTerminalUnsubscribe = "terminal.unsubscribe"
)
