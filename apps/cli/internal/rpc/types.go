package rpc

import (
	"yishan/apps/cli/internal/computer"
	localdb "yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/workspace/application"
)

// ---- file namespace ----

type FileReadParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
}

type FileListParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path,omitempty"`
	Recursive   bool   `json:"recursive,omitempty"`
}

type FileSearchParams struct {
	WorkspaceID        string `json:"workspaceId"`
	Query              string `json:"query"`
	Limit              int    `json:"limit,omitempty"`
	IncludeDirectories bool   `json:"includeDirectories,omitempty"`
}

type FileWriteParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
	Content     string `json:"content"`
	Mode        uint32 `json:"mode,omitempty"`
}

type FileDeleteParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
	Recursive   bool   `json:"recursive,omitempty"`
}

type FileMoveParams struct {
	WorkspaceID string `json:"workspaceId"`
	FromPath    string `json:"fromPath"`
	ToPath      string `json:"toPath"`
}

type FileMkdirParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
	Parents     bool   `json:"parents,omitempty"`
	Mode        uint32 `json:"mode,omitempty"`
}

// ---- git namespace ----

type GitStatusParams struct {
	WorkspaceID string `json:"workspaceId"`
}

type GitInspectParams struct {
	WorkspaceID string `json:"workspaceId"`
}

type GitInspectPathParams struct {
	Path string `json:"path"`
}

type GitPathsParams struct {
	WorkspaceID string   `json:"workspaceId"`
	Paths       []string `json:"paths"`
}

type GitCommitParams struct {
	WorkspaceID string `json:"workspaceId"`
	Message     string `json:"message"`
	Amend       bool   `json:"amend,omitempty"`
	Signoff     bool   `json:"signoff,omitempty"`
}

type GitTargetBranchParams struct {
	WorkspaceID  string `json:"workspaceId"`
	TargetBranch string `json:"targetBranch"`
}

type GitBranchPullRequestParams struct {
	WorkspaceID string `json:"workspaceId"`
	Branch      string `json:"branch"`
}

type GitCommitDiffParams struct {
	WorkspaceID string `json:"workspaceId"`
	CommitHash  string `json:"commitHash"`
	Path        string `json:"path"`
}

type GitBranchDiffParams struct {
	WorkspaceID  string `json:"workspaceId"`
	TargetBranch string `json:"targetBranch"`
	Path         string `json:"path"`
}

type GitRenameBranchParams struct {
	WorkspaceID string `json:"workspaceId"`
	NextBranch  string `json:"nextBranch"`
}

type GitRemoveBranchParams struct {
	WorkspaceID string `json:"workspaceId"`
	Branch      string `json:"branch"`
	Force       bool   `json:"force,omitempty"`
}

type GitPrMergeParams struct {
	WorkspaceID  string `json:"workspaceId"`
	PrNumber     int    `json:"prNumber"`
	Method       string `json:"method,omitempty"`
	DeleteBranch bool   `json:"deleteBranch,omitempty"`
}

type GitPrCloseParams struct {
	WorkspaceID string `json:"workspaceId"`
	PrNumber    int    `json:"prNumber"`
}

type GitCreateWorktreeParams struct {
	WorkspaceID  string `json:"workspaceId"`
	Branch       string `json:"branch"`
	WorktreePath string `json:"worktreePath"`
	CreateBranch bool   `json:"createBranch,omitempty"`
	FromRef      string `json:"fromRef,omitempty"`
}

type GitRemoveWorktreeParams struct {
	WorkspaceID  string `json:"workspaceId"`
	WorktreePath string `json:"worktreePath"`
	Force        bool   `json:"force,omitempty"`
}

// ---- workspace namespace ----

type WorkspaceHealthParams struct {
	WorkspaceID string `json:"workspaceId"`
}

type WorkspaceHealthResult struct {
	WorkspaceID string `json:"workspaceId"`
	State       string `json:"state"`
	Health      string `json:"health,omitempty"`
	Path        string `json:"path"`
	Error       string `json:"error,omitempty"`
}

type WorkspaceOpenProjectEntry struct {
	WorkspaceID  string `json:"workspaceId"`
	WorktreePath string `json:"worktreePath"`
	ProjectID    string `json:"projectId,omitempty"`
	OrgID        string `json:"orgId,omitempty"`
}

type WorkspaceOpenProjectParams struct {
	Workspaces []WorkspaceOpenProjectEntry `json:"workspaces"`
}

type WorkspaceOpenProjectResult struct {
	Opened  []string `json:"opened"`
	Skipped []string `json:"skipped"`
	Errors  []string `json:"errors"`
}

type WorkspaceCloseProjectParams struct {
	WorkspaceIDs []string `json:"workspaceIds"`
}

type WorkspaceCloseProjectResult struct {
	Stopped []string `json:"stopped"`
}

type WorkspaceCreateLocalFolderParams struct {
	Path string `json:"path"`
	Name string `json:"name,omitempty"`
}

type WorkspaceDeleteLocalFolderParams struct {
	ID string `json:"id"`
}

// WorkspaceCreateParams is the workspace.create request (the application
// facade's create command).
type WorkspaceCreateParams = application.CreateCommand

// WorkspaceCloseParams is the workspace.close request (the application
// facade's close command).
type WorkspaceCloseParams = application.CloseCommand

// ---- terminal namespace ----

type TerminalRemoteSubscribeParams struct {
	SessionID string `json:"sessionId"`
	OwnerNode string `json:"ownerNode"`
}

type TerminalRemoteUnsubscribeParams struct {
	SessionID string `json:"sessionId"`
	OwnerNode string `json:"ownerNode"`
}

// ---- memory namespace ----

type MemorySearchParams struct {
	Query       string `json:"query"`
	WorkspaceID string `json:"workspaceId"`
	Scope       string `json:"scope"`
	Limit       int    `json:"limit"`
}

type MemoryUpdateConfigParams struct {
	Enabled   bool   `json:"enabled"`
	AgentKind string `json:"agentKind"`
	Model     string `json:"model"`
}

// ---- computer namespace ----

type ComputerListWindowsParams struct {
	Filter computer.WindowFilter `json:"filter"`
}

type ComputerCaptureDisplayParams struct {
	DisplayID string                  `json:"displayId"`
	Options   computer.CaptureOptions `json:"options"`
}

type ComputerCaptureWindowParams struct {
	WindowID string                  `json:"windowId"`
	Options  computer.CaptureOptions `json:"options"`
}

type ComputerGetUITreeParams struct {
	Target  computer.Target      `json:"target"`
	Options computer.TreeOptions `json:"options"`
}

type ComputerFocusWindowParams struct {
	WindowID string `json:"windowId"`
}

type ComputerLaunchApplicationParams struct {
	BundleID string `json:"bundleId"`
}

type ComputerMovePointerParams struct {
	Point computer.Point `json:"point"`
}

type ComputerTypeTextParams struct {
	Text string `json:"text"`
}

type ComputerOpenPermissionSettingsParams struct {
	Permission string `json:"permission"`
}

// ---- project namespace ----

type ProjectListParams struct {
	OrganizationID string `json:"organizationId"`
}

type ProjectListWithWorkspacesParams struct {
	OrganizationID string `json:"organizationId"`
}

type ProjectGetListPreferencesParams struct {
	OrganizationID string `json:"organizationId"`
}

type ProjectSetListPreferencesParams struct {
	OrganizationID string                        `json:"organizationId"`
	Preferences    localdb.ProjectListPreference `json:"preferences"`
}

// ---- context namespace ----

type ContextSetCurrentOrgParams struct {
	OrgID string `json:"orgId"`
}

type ContextSetActiveProjectParams struct {
	ProjectID string `json:"projectId"`
}

type ContextSetActiveFileParams struct {
	FilePath string `json:"filePath"`
}

// ---- system namespace ----

type SystemAgentListModelsParams struct {
	AgentKind    string `json:"agentKind"`
	ForceRefresh bool   `json:"forceRefresh"`
}

type SystemProjectListParams struct {
	OrgID string `json:"orgId"`
}

type SystemNodeListParams struct {
	OrgID string `json:"orgId"`
}

type SystemCLIToolInstallParams struct {
	ToolID string `json:"toolId"`
}

type SystemCLIToolUninstallParams struct {
	ToolID string `json:"toolId"`
}
