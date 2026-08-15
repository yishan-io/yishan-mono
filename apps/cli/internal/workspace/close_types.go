package workspace

// Workspace open/close request types (previously defined on the removed
// workspace.Manager facade; the close engine lives in workspace/application
// and the composition root in internal/node).

// OpenRequest opens an existing worktree as a workspace instance.
type OpenRequest struct {
	ID              string `json:"id"`
	Path            string `json:"path"`
	OrgID           string `json:"orgId,omitempty"`
	ProjectID       string `json:"projectId,omitempty"`
	PRAlreadyMerged bool   `json:"prAlreadyMerged,omitempty"`
}

// RefreshPullRequestRequest targets a workspace by id or worktree path for a
// pull-request refresh.
type RefreshPullRequestRequest struct {
	WorkspaceID string `json:"workspaceId,omitempty"`
	Path        string `json:"path,omitempty"`
}

// CloseRequest closes a workspace by id.
type CloseRequest struct {
	WorkspaceID   string
	Branch        string
	RemoveBranch  bool
	ForceWorktree bool
	ForceBranch   bool
	PostHook      string
}

// ClosePathRequest closes a workspace by id and explicit path (used by the
// relay executor and the create-rollback cleanup).
type ClosePathRequest struct {
	WorkspaceID   string
	Path          string
	Branch        string
	RemoveBranch  bool
	ForceWorktree bool
	ForceBranch   bool
	PostHook      string
}

// CloseResult captures the outcome of a workspace close operation, including
// any post-hook execution result.
type CloseResult struct {
	PostHookResult        *HookResult `json:"postHookResult,omitempty"`
	TerminalCleanupErrors []string    `json:"terminalCleanupErrors,omitempty"`
}
