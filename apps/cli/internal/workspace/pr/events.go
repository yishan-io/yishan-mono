package pr

import "yishan/apps/cli/internal/workspace"

// PullRequestUpdatedEvent is published to the application boundary whenever a
// tracked workspace's pull request meaningfully changes. The composition root
// subscribes and forwards it to the desktop event hub.
type PullRequestUpdatedEvent struct {
	WorkspaceID           string
	WorkspaceWorktreePath string
	PullRequest           *workspace.WorkspacePullRequest
}
