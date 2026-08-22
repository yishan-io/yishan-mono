package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
)

// The Services interfaces are the application-facing contract the rpc
// namespace handlers call. Each RPC method maps to exactly one typed service
// method. The daemon implements them; handlers never construct services.

// WorkspaceService backs the workspace.* and list RPC methods. Each method is
// named after the wire method tail; the service type already carries the
// namespace. ListWorkspaces keeps its name because the bare "list" method is
// the workspace list (file.List is the file.* list).
type WorkspaceService interface {
	ListWorkspaces() (any, error)
	Create(ctx context.Context, req WorkspaceCreateParams) (any, error)
	Close(ctx context.Context, req WorkspaceCloseParams) (any, error)
	RefreshPullRequest(ctx context.Context, req workspace.RefreshPullRequestRequest) (any, error)
	SetActive(ctx context.Context, req terminal.SetActiveWorkspaceRequest) (any, error)
	SyncContextLink(ctx context.Context, req workspace.SyncContextLinkRequest) (any, error)
	Health(ctx context.Context, req WorkspaceHealthParams) (any, error)
	OpenProject(ctx context.Context, req WorkspaceOpenProjectParams) (any, error)
	CloseProject(ctx context.Context, req WorkspaceCloseProjectParams) (any, error)
	ImportLocalPath(ctx context.Context, req WorkspaceImportLocalPathParams) (any, error)
	ListLocalFolders(ctx context.Context) (any, error)
	DeleteLocalFolder(ctx context.Context, req WorkspaceDeleteLocalFolderParams) (any, error)
}

// FileService backs the file.* RPC methods. Each method is named after the
// wire method tail; the service type already carries the namespace.
type FileService interface {
	Read(ctx context.Context, req FileReadParams) (any, error)
	List(ctx context.Context, req FileListParams) (any, error)
	Search(ctx context.Context, req FileSearchParams) (any, error)
	Stat(ctx context.Context, req FileReadParams) (any, error)
	Write(ctx context.Context, req FileWriteParams) (any, error)
	Delete(ctx context.Context, req FileDeleteParams) (any, error)
	Move(ctx context.Context, req FileMoveParams) (any, error)
	Mkdir(ctx context.Context, req FileMkdirParams) (any, error)
	Diff(ctx context.Context, req FileReadParams) (any, error)
}

// GitService backs the git.* RPC methods. Each method is named after the
// wire method tail; the service type already carries the namespace.
type GitService interface {
	Status(ctx context.Context, req GitStatusParams) (any, error)
	Inspect(ctx context.Context, req GitInspectParams) (any, error)
	InspectPath(ctx context.Context, req GitInspectPathParams) (any, error)
	ListChanges(ctx context.Context, req GitStatusParams) (any, error)
	Track(ctx context.Context, req GitPathsParams) (any, error)
	Unstage(ctx context.Context, req GitPathsParams) (any, error)
	Revert(ctx context.Context, req GitPathsParams) (any, error)
	Commit(ctx context.Context, req GitCommitParams) (any, error)
	BranchStatus(ctx context.Context, req GitStatusParams) (any, error)
	BranchPullRequest(ctx context.Context, req GitBranchPullRequestParams) (any, error)
	CommitsToTarget(ctx context.Context, req GitTargetBranchParams) (any, error)
	BranchDiffSummary(ctx context.Context, req GitTargetBranchParams) (any, error)
	CommitDiff(ctx context.Context, req GitCommitDiffParams) (any, error)
	BranchDiff(ctx context.Context, req GitBranchDiffParams) (any, error)
	Branches(ctx context.Context, req GitStatusParams) (any, error)
	Push(ctx context.Context, req GitStatusParams) (any, error)
	Publish(ctx context.Context, req GitStatusParams) (any, error)
	RenameBranch(ctx context.Context, req GitRenameBranchParams) (any, error)
	RemoveBranch(ctx context.Context, req GitRemoveBranchParams) (any, error)
	PrMerge(ctx context.Context, req GitPrMergeParams) (any, error)
	PrClose(ctx context.Context, req GitPrCloseParams) (any, error)
	WorktreeCreate(ctx context.Context, req GitCreateWorktreeParams) (any, error)
	WorktreeRemove(ctx context.Context, req GitRemoveWorktreeParams) (any, error)
	AuthorName(ctx context.Context, req GitStatusParams) (any, error)
}

// TerminalService backs the terminal.* RPC methods. Connection-bound
// subscriptions are wired by the handler (the connection is passed in). Each
// method is named after the wire method tail; the service type already
// carries the namespace.
type TerminalService interface {
	Start(ctx context.Context, connection *Connection, req terminal.StartRequest) (any, error)
	Send(ctx context.Context, req terminal.SendRequest) (any, error)
	Read(ctx context.Context, req terminal.ReadRequest) (any, error)
	Stop(ctx context.Context, req terminal.StopRequest) (any, error)
	KillProcess(ctx context.Context, req terminal.KillProcessRequest) (any, error)
	ListSessions(ctx context.Context, req terminal.ListSessionsRequest) (any, error)
	ListPorts(ctx context.Context) (any, error)
	Resize(ctx context.Context, req terminal.ResizeRequest) (any, error)
	Subscribe(ctx context.Context, connection *Connection, req terminal.SubscribeRequest) (any, error)
	Unsubscribe(ctx context.Context, connection *Connection, req terminal.UnsubscribeRequest) (any, error)
	RemoteSubscribe(ctx context.Context, connection *Connection, req TerminalRemoteSubscribeParams) (any, error)
	RemoteUnsubscribe(ctx context.Context, connection *Connection, req TerminalRemoteUnsubscribeParams) (any, error)
}

// MemoryService backs the memory.* RPC methods. Each method is named after
// the wire method tail; the service type already carries the namespace.
type MemoryService interface {
	Search(ctx context.Context, req MemorySearchParams) (any, error)
	Reconcile(ctx context.Context) (any, error)
	Status(ctx context.Context) (any, error)
	Config(ctx context.Context) (any, error)
	SetConfig(ctx context.Context, req MemoryUpdateConfigParams) (any, error)
}

// ComputerService backs the computer.* RPC methods. Each method is named
// after the wire method tail; the service type already carries the namespace.
type ComputerService interface {
	Health(ctx context.Context) (any, error)
	Permissions(ctx context.Context) (any, error)
	GetConfig(ctx context.Context) (any, error)
	UpdateConfig(ctx context.Context, req computer.FeatureConfig) (any, error)
	ListDisplays(ctx context.Context) (any, error)
	ListApplications(ctx context.Context) (any, error)
	ListWindows(ctx context.Context, req ComputerListWindowsParams) (any, error)
	CaptureDisplay(ctx context.Context, req ComputerCaptureDisplayParams) (any, error)
	CaptureWindow(ctx context.Context, req ComputerCaptureWindowParams) (any, error)
	GetUITree(ctx context.Context, req ComputerGetUITreeParams) (any, error)
	PerformAction(ctx context.Context, req computer.AccessibilityActionRequest) (any, error)
	FocusWindow(ctx context.Context, req ComputerFocusWindowParams) (any, error)
	LaunchApplication(ctx context.Context, req ComputerLaunchApplicationParams) (any, error)
	MovePointer(ctx context.Context, req ComputerMovePointerParams) (any, error)
	Click(ctx context.Context, req computer.ClickRequest) (any, error)
	Drag(ctx context.Context, req computer.DragRequest) (any, error)
	Scroll(ctx context.Context, req computer.ScrollRequest) (any, error)
	TypeText(ctx context.Context, req ComputerTypeTextParams) (any, error)
	SendKey(ctx context.Context, req computer.KeyRequest) (any, error)
	ReadClipboard(ctx context.Context) (any, error)
	WriteClipboard(ctx context.Context, req computer.ClipboardContent) (any, error)
	OpenPermissionSettings(ctx context.Context, req ComputerOpenPermissionSettingsParams) (any, error)
}

// ContextService backs the context.* RPC methods. Each method is named after
// the wire method tail; the service type already carries the namespace.
type ContextService interface {
	GetState() (any, error)
	SetCurrentOrg(ctx context.Context, req ContextSetCurrentOrgParams) (any, error)
	SetActiveProject(ctx context.Context, req ContextSetActiveProjectParams) (any, error)
	SetActiveFile(ctx context.Context, req ContextSetActiveFileParams) (any, error)
}

// LocalTaskService backs the localTask.* RPC methods.
type LocalTaskService interface {
	Create(ctx context.Context, req LocalTaskCreateParams) (any, error)
	Get(ctx context.Context, req LocalTaskIDParams) (any, error)
	GetContextDetails(ctx context.Context, req LocalTaskIDParams) (any, error)
	List(ctx context.Context, req LocalTaskListParams) (any, error)
	Update(ctx context.Context, req LocalTaskUpdateParams) (any, error)
	Search(ctx context.Context, req LocalTaskSearchParams) (any, error)
	LinkWorkspace(ctx context.Context, req LocalTaskLinkWorkspaceParams) (any, error)
	UnlinkWorkspace(ctx context.Context, req LocalTaskLinkIDParams) (any, error)
	UpdateWorkspaceLinkStatus(ctx context.Context, req LocalTaskUpdateLinkStatusParams) (any, error)
	SetPrimary(ctx context.Context, req LocalTaskSetPrimaryParams) (any, error)
	ListWorkspaceLinks(ctx context.Context, req LocalTaskWorkspaceIDParams) (any, error)
	ListTaskLinks(ctx context.Context, req LocalTaskIDParams) (any, error)
}

// projectService backs the project.* RPC methods. Each method is named after
// the wire method tail: the service type already carries the namespace.
type projectService interface {
	List(ctx context.Context, req ProjectListParams) (any, error)
	ListWithWorkspaces(ctx context.Context, req ProjectListWithWorkspacesParams) (any, error)
	GetListPreferences(ctx context.Context, req ProjectGetListPreferencesParams) (any, error)
	SetListPreferences(ctx context.Context, req ProjectSetListPreferencesParams) (any, error)
}

// SystemService backs the daemon./app./agent./tokenUsage./node. RPC methods.
// Each method is named after the wire method tail; the service type already
// carries the namespace.
type SystemService interface {
	DaemonPing() (any, error)
	FrontendEventsStream(ctx context.Context, connection *Connection) (any, error)
	AgentListDetectionStatuses(ctx context.Context, params json.RawMessage) (any, error)
	CLIToolListStatuses(ctx context.Context, params json.RawMessage) (any, error)
	CLIToolInstall(ctx context.Context, req SystemCLIToolInstallParams) (any, error)
	CLIToolUninstall(ctx context.Context, req SystemCLIToolUninstallParams) (any, error)
	IntegrationGitHubStatus(ctx context.Context, params json.RawMessage) (any, error)
	AppPersistAuthTokens(ctx context.Context, params json.RawMessage) (any, error)
	AppGetAccessToken(ctx context.Context) (any, error)
	AppCheckAuthStatus(ctx context.Context) (any, error)
	AppLogout(ctx context.Context) (any, error)
	AppReloadAuthConfig(ctx context.Context) (any, error)
	AgentListModels(ctx context.Context, req SystemAgentListModelsParams) (any, error)
	TokenUsageDebugState(ctx context.Context) (any, error)
	ProjectList(ctx context.Context, req SystemProjectListParams) (any, error)
	NodeList(ctx context.Context, req SystemNodeListParams) (any, error)
}
