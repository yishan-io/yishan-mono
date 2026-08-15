package daemon

import "yishan/apps/cli/internal/rpc"

// notification is the daemon-side alias for the JSON-RPC notification envelope
// (protocol types are defined in internal/rpc).
type notification = rpc.Notification

// request is the daemon-side alias for the JSON-RPC request envelope.
type request = rpc.Request

// response is the daemon-side alias for the JSON-RPC response envelope.
type response = rpc.Response

type fileListParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path,omitempty"`
	Recursive   bool   `json:"recursive,omitempty"`
}

type fileSearchParams struct {
	WorkspaceID        string `json:"workspaceId"`
	Query              string `json:"query"`
	Limit              int    `json:"limit,omitempty"`
	IncludeDirectories bool   `json:"includeDirectories,omitempty"`
}

type fileReadParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
}

type fileWriteParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
	Content     string `json:"content"`
	Mode        uint32 `json:"mode,omitempty"`
}

type fileDeleteParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
	Recursive   bool   `json:"recursive,omitempty"`
}

type fileMoveParams struct {
	WorkspaceID string `json:"workspaceId"`
	FromPath    string `json:"fromPath"`
	ToPath      string `json:"toPath"`
}

type fileMkdirParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
	Parents     bool   `json:"parents,omitempty"`
	Mode        uint32 `json:"mode,omitempty"`
}

type gitStatusParams struct {
	WorkspaceID string `json:"workspaceId"`
}

type workspaceHealthParams struct {
	WorkspaceID string `json:"workspaceId"`
}

type workspaceHealthResult struct {
	WorkspaceID string `json:"workspaceId"`
	State       string `json:"state"`
	Health      string `json:"health,omitempty"`
	Path        string `json:"path"`
	Error       string `json:"error,omitempty"`
}

type workspaceOpenProjectEntry struct {
	WorkspaceID  string `json:"workspaceId"`
	WorktreePath string `json:"worktreePath"`
	ProjectID    string `json:"projectId,omitempty"`
	OrgID        string `json:"orgId,omitempty"`
}

type workspaceOpenProjectParams struct {
	Workspaces []workspaceOpenProjectEntry `json:"workspaces"`
}

type workspaceOpenProjectResult struct {
	Opened  []string `json:"opened"`
	Skipped []string `json:"skipped"`
	Errors  []string `json:"errors"`
}

type workspaceCloseProjectParams struct {
	WorkspaceIDs []string `json:"workspaceIds"`
}

type workspaceCloseProjectResult struct {
	Stopped []string `json:"stopped"`
}

type gitInspectParams struct {
	WorkspaceID string `json:"workspaceId"`
}

type gitInspectPathParams struct {
	Path string `json:"path"`
}

type gitPathsParams struct {
	WorkspaceID string   `json:"workspaceId"`
	Paths       []string `json:"paths"`
}

type gitCommitParams struct {
	WorkspaceID string `json:"workspaceId"`
	Message     string `json:"message"`
	Amend       bool   `json:"amend,omitempty"`
	Signoff     bool   `json:"signoff,omitempty"`
}

type gitTargetBranchParams struct {
	WorkspaceID  string `json:"workspaceId"`
	TargetBranch string `json:"targetBranch"`
}

type gitBranchPullRequestParams struct {
	WorkspaceID string `json:"workspaceId"`
	Branch      string `json:"branch"`
}

type gitCommitDiffParams struct {
	WorkspaceID string `json:"workspaceId"`
	CommitHash  string `json:"commitHash"`
	Path        string `json:"path"`
}

type gitBranchDiffParams struct {
	WorkspaceID  string `json:"workspaceId"`
	TargetBranch string `json:"targetBranch"`
	Path         string `json:"path"`
}

type gitRenameBranchParams struct {
	WorkspaceID string `json:"workspaceId"`
	NextBranch  string `json:"nextBranch"`
}

type gitRemoveBranchParams struct {
	WorkspaceID string `json:"workspaceId"`
	Branch      string `json:"branch"`
	Force       bool   `json:"force,omitempty"`
}

type gitPrMergeParams struct {
	WorkspaceID  string `json:"workspaceId"`
	PrNumber     int    `json:"prNumber"`
	Method       string `json:"method,omitempty"`
	DeleteBranch bool   `json:"deleteBranch,omitempty"`
}

type gitPrCloseParams struct {
	WorkspaceID string `json:"workspaceId"`
	PrNumber    int    `json:"prNumber"`
}

type gitCreateWorktreeParams struct {
	WorkspaceID  string `json:"workspaceId"`
	Branch       string `json:"branch"`
	WorktreePath string `json:"worktreePath"`
	CreateBranch bool   `json:"createBranch,omitempty"`
	FromRef      string `json:"fromRef,omitempty"`
}

type gitRemoveWorktreeParams struct {
	WorkspaceID  string `json:"workspaceId"`
	WorktreePath string `json:"worktreePath"`
	Force        bool   `json:"force,omitempty"`
}
