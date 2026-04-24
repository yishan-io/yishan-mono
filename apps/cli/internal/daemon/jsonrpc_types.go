package daemon

import "encoding/json"

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type response struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id,omitempty"`
	Result  any       `json:"result,omitempty"`
	Error   *rpcError `json:"error,omitempty"`
}

type notification struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type fileListParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path,omitempty"`
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

type gitInspectParams struct {
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
