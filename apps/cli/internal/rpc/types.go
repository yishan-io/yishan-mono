package rpc

import (
	"encoding/json"

	"yishan/apps/cli/internal/workspace/application"
)

// ---- file namespace ----

type FileReadParams struct {
	WorkspaceID string `json:"workspaceId"`
	Path        string `json:"path"`
}

type FileListParams struct {
	IncludeFreshness bool   `json:"includeFreshness,omitempty"`
	WorkspaceID      string `json:"workspaceId"`
	Path             string `json:"path,omitempty"`
	Recursive        bool   `json:"recursive,omitempty"`
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
	Kind         string `json:"kind,omitempty"`
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

// WorkspaceListPullRequestsParams selects the workspace whose recorded pull
// request history is returned.
type WorkspaceListPullRequestsParams struct {
	WorkspaceID string `json:"workspaceId"`
}

// WorkspacePullRequestRecord is one pull request the daemon has observed for a
// workspace. Metadata is the raw JSON snapshot recorded by the PR tracker.
type WorkspacePullRequestRecord struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspaceId"`
	OrganizationID string  `json:"organizationId"`
	PRID           string  `json:"prId"`
	Title          *string `json:"title"`
	URL            *string `json:"url"`
	Branch         *string `json:"branch"`
	BaseBranch     *string `json:"baseBranch"`
	State          string  `json:"state"`
	Metadata       *string `json:"metadata"`
	DetectedAt     string  `json:"detectedAt"`
	ResolvedAt     *string `json:"resolvedAt"`
}

// WorkspaceListPullRequestsResult lists recorded pull requests, newest detection first.
type WorkspaceListPullRequestsResult struct {
	PullRequests []WorkspacePullRequestRecord `json:"pullRequests"`
}

type WorkspaceImportLocalPathParams struct {
	Path string `json:"path"`
	Name string `json:"name,omitempty"`
	// OrganizationID scopes a newly created folder to the caller's selected
	// organization. Empty keeps the legacy unowned folder (adopted later).
	OrganizationID string `json:"organizationId,omitempty"`
}

// WorkspaceImportLocalPathResult classifies an existing local directory. Git
// directories are returned for backend project creation; non-git directories
// are persisted as daemon-local folders.
type WorkspaceImportLocalPathResult struct {
	Kind          string                          `json:"kind"`
	Folder        *WorkspaceImportLocalPathFolder `json:"folder,omitempty"`
	RemoteURL     string                          `json:"remoteUrl,omitempty"`
	CurrentBranch string                          `json:"currentBranch,omitempty"`
}

// WorkspaceImportLocalPathFolder is the daemon-local folder DTO returned when
// importing a non-git local path.
type WorkspaceImportLocalPathFolder struct {
	ID        string  `json:"id"`
	LocalPath string  `json:"localPath"`
	Name      *string `json:"name,omitempty"`
	State     string  `json:"state,omitempty"`
	Health    *string `json:"health,omitempty"`
}

// WorkspaceListLocalFoldersParams filters folders by organization. Empty
// OrganizationID (or absent params) lists every folder.
type WorkspaceListLocalFoldersParams struct {
	OrganizationID string `json:"organizationId,omitempty"`
}

// WorkspaceAdoptLocalFoldersParams assigns every unowned legacy folder to
// OrganizationID.
type WorkspaceAdoptLocalFoldersParams struct {
	OrganizationID string `json:"organizationId"`
}

// WorkspaceAdoptLocalFoldersResult lists the folder IDs that were adopted.
type WorkspaceAdoptLocalFoldersResult struct {
	AdoptedIDs []string `json:"adoptedIds"`
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

// ---- project namespace ----

type ProjectListParams struct {
	OrganizationID string `json:"organizationId"`
}

type ProjectListWithWorkspacesParams struct {
	OrganizationID string `json:"organizationId"`
}

// ProjectCreateParams creates a daemon-owned project. A non-empty LocalPath
// also records this node's primary workspace at that checkout.
type ProjectCreateParams struct {
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
	TaskPrefix     string `json:"taskPrefix"`
	SourceTypeHint string `json:"sourceTypeHint,omitempty"`
	RepoURL        string `json:"repoUrl,omitempty"`
	LocalPath      string `json:"localPath,omitempty"`
	ContextEnabled *bool  `json:"contextEnabled,omitempty"`
	Icon           string `json:"icon,omitempty"`
	Color          string `json:"color,omitempty"`
}

// ProjectCommandParam is one named project command on the wire.
type ProjectCommandParam struct {
	Name    string `json:"name"`
	Command string `json:"command"`
}

// ProjectUpdateParams changes project configuration; nil fields are kept.
// LocalPath moves this node's primary workspace.
type ProjectUpdateParams struct {
	OrganizationID string                 `json:"organizationId"`
	ProjectID      string                 `json:"projectId"`
	LocalPath      *string                `json:"localPath,omitempty"`
	Name           *string                `json:"name,omitempty"`
	Icon           *string                `json:"icon,omitempty"`
	Color          *string                `json:"color,omitempty"`
	SetupScript    *string                `json:"setupScript,omitempty"`
	PostScript     *string                `json:"postScript,omitempty"`
	Commands       *[]ProjectCommandParam `json:"commands,omitempty"`
	ContextEnabled *bool                  `json:"contextEnabled,omitempty"`
}

// ProjectRefParams identifies one project (delete, ensureTaskPrefix).
type ProjectRefParams struct {
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId"`
}

// ProjectPromoteGitParams promotes a git-local project to a git project.
type ProjectPromoteGitParams struct {
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId"`
	RemoteURL      string `json:"remoteUrl"`
}

// ---- scheduledJob namespace ----

// ScheduledJobListParams lists an organization's jobs, optionally for one project.
type ScheduledJobListParams struct {
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId,omitempty"`
}

// ScheduledJobCreateParams creates a job that runs on this daemon's node.
type ScheduledJobCreateParams struct {
	OrganizationID string  `json:"organizationId"`
	ProjectID      string  `json:"projectId"`
	NodeID         string  `json:"nodeId,omitempty"`
	Name           string  `json:"name"`
	AgentKind      string  `json:"agentKind,omitempty"`
	Prompt         string  `json:"prompt"`
	Model          *string `json:"model,omitempty"`
	Command        *string `json:"command,omitempty"`
	CronExpression string  `json:"cronExpression"`
	Timezone       string  `json:"timezone,omitempty"`
}

// ScheduledJobUpdateParams changes a job's definition; nil fields are kept.
// Model and Command accept an explicit null (ClearModel/ClearCommand).
type ScheduledJobUpdateParams struct {
	OrganizationID string           `json:"organizationId"`
	JobID          string           `json:"jobId"`
	NodeID         *string          `json:"nodeId,omitempty"`
	Name           *string          `json:"name,omitempty"`
	AgentKind      *string          `json:"agentKind,omitempty"`
	Prompt         *string          `json:"prompt,omitempty"`
	Model          OptionalNullable `json:"model"`
	Command        OptionalNullable `json:"command"`
	CronExpression *string          `json:"cronExpression,omitempty"`
	Timezone       *string          `json:"timezone,omitempty"`
}

// ScheduledJobRefParams identifies one job.
type ScheduledJobRefParams struct {
	OrganizationID string `json:"organizationId"`
	JobID          string `json:"jobId"`
}

// ScheduledJobListRunsParams lists a job's recent runs.
type ScheduledJobListRunsParams struct {
	OrganizationID string `json:"organizationId"`
	JobID          string `json:"jobId"`
	Limit          int    `json:"limit,omitempty"`
}

// OptionalNullable distinguishes an absent field (Set false) from an explicit
// null (Set true, Value nil) and a value.
type OptionalNullable struct {
	Set   bool
	Value *string
}

// UnmarshalJSON records that the field was present.
func (field *OptionalNullable) UnmarshalJSON(data []byte) error {
	field.Set = true
	if string(data) == "null" {
		field.Value = nil
		return nil
	}
	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	field.Value = &value
	return nil
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

type SystemCLIToolInstallParams struct {
	ToolID string `json:"toolId"`
}

type SystemCLIToolUninstallParams struct {
	ToolID string `json:"toolId"`
}
