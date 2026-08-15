package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/terminal"
)

// The Services interfaces are the application-facing contract the rpc
// namespace handlers call. Each RPC method maps to exactly one typed service
// method. The daemon implements them; handlers never construct services.

// WorkspaceService backs the workspace.* and list RPC methods.
type WorkspaceService interface {
	ListWorkspaces() (any, error)
	WorkspaceCreate(ctx context.Context, req WorkspaceCreateParams) (any, error)
	WorkspaceClose(ctx context.Context, req WorkspaceCloseParams) (any, error)
	WorkspaceRefreshPullRequest(ctx context.Context, req workspace.RefreshPullRequestRequest) (any, error)
	WorkspaceSetActive(ctx context.Context, req terminal.SetActiveWorkspaceRequest) (any, error)
	WorkspaceSyncContextLink(ctx context.Context, req workspace.SyncContextLinkRequest) (any, error)
	WorkspaceHealth(ctx context.Context, req WorkspaceHealthParams) (any, error)
	WorkspaceOpenProject(ctx context.Context, req WorkspaceOpenProjectParams) (any, error)
	WorkspaceCloseProject(ctx context.Context, req WorkspaceCloseProjectParams) (any, error)
	WorkspaceCreateLocalFolder(ctx context.Context, req WorkspaceCreateLocalFolderParams) (any, error)
	WorkspaceListLocalFolders(ctx context.Context) (any, error)
	WorkspaceDeleteLocalFolder(ctx context.Context, req WorkspaceDeleteLocalFolderParams) (any, error)
}

// FileService backs the file.* RPC methods.
type FileService interface {
	FileRead(ctx context.Context, req FileReadParams) (any, error)
	FileList(ctx context.Context, req FileListParams) (any, error)
	FileSearch(ctx context.Context, req FileSearchParams) (any, error)
	FileStat(ctx context.Context, req FileReadParams) (any, error)
	FileWrite(ctx context.Context, req FileWriteParams) (any, error)
	FileDelete(ctx context.Context, req FileDeleteParams) (any, error)
	FileMove(ctx context.Context, req FileMoveParams) (any, error)
	FileMkdir(ctx context.Context, req FileMkdirParams) (any, error)
	FileDiff(ctx context.Context, req FileReadParams) (any, error)
}

// GitService backs the git.* RPC methods.
type GitService interface {
	GitStatus(ctx context.Context, req GitStatusParams) (any, error)
	GitInspect(ctx context.Context, req GitInspectParams) (any, error)
	GitInspectPath(ctx context.Context, req GitInspectPathParams) (any, error)
	GitListChanges(ctx context.Context, req GitStatusParams) (any, error)
	GitTrack(ctx context.Context, req GitPathsParams) (any, error)
	GitUnstage(ctx context.Context, req GitPathsParams) (any, error)
	GitRevert(ctx context.Context, req GitPathsParams) (any, error)
	GitCommit(ctx context.Context, req GitCommitParams) (any, error)
	GitBranchStatus(ctx context.Context, req GitStatusParams) (any, error)
	GitBranchPullRequest(ctx context.Context, req GitBranchPullRequestParams) (any, error)
	GitCommitsToTarget(ctx context.Context, req GitTargetBranchParams) (any, error)
	GitBranchDiffSummary(ctx context.Context, req GitTargetBranchParams) (any, error)
	GitCommitDiff(ctx context.Context, req GitCommitDiffParams) (any, error)
	GitBranchDiff(ctx context.Context, req GitBranchDiffParams) (any, error)
	GitBranches(ctx context.Context, req GitStatusParams) (any, error)
	GitPush(ctx context.Context, req GitStatusParams) (any, error)
	GitPublish(ctx context.Context, req GitStatusParams) (any, error)
	GitRenameBranch(ctx context.Context, req GitRenameBranchParams) (any, error)
	GitRemoveBranch(ctx context.Context, req GitRemoveBranchParams) (any, error)
	GitPrMerge(ctx context.Context, req GitPrMergeParams) (any, error)
	GitPrClose(ctx context.Context, req GitPrCloseParams) (any, error)
	GitWorktreeCreate(ctx context.Context, req GitCreateWorktreeParams) (any, error)
	GitWorktreeRemove(ctx context.Context, req GitRemoveWorktreeParams) (any, error)
	GitAuthorName(ctx context.Context, req GitStatusParams) (any, error)
}

// TerminalService backs the terminal.* RPC methods. Connection-bound
// subscriptions are wired by the handler (the connection is passed in).
type TerminalService interface {
	TerminalStart(ctx context.Context, connection *Connection, req terminal.StartRequest) (any, error)
	TerminalSend(ctx context.Context, req terminal.SendRequest) (any, error)
	TerminalRead(ctx context.Context, req terminal.ReadRequest) (any, error)
	TerminalStop(ctx context.Context, req terminal.StopRequest) (any, error)
	TerminalKillProcess(ctx context.Context, req terminal.KillProcessRequest) (any, error)
	TerminalListSessions(ctx context.Context, req terminal.ListSessionsRequest) (any, error)
	TerminalListPorts(ctx context.Context) (any, error)
	TerminalResize(ctx context.Context, req terminal.ResizeRequest) (any, error)
	TerminalSubscribe(ctx context.Context, connection *Connection, req terminal.SubscribeRequest) (any, error)
	TerminalUnsubscribe(ctx context.Context, connection *Connection, req terminal.UnsubscribeRequest) (any, error)
	TerminalRemoteSubscribe(ctx context.Context, connection *Connection, req TerminalRemoteSubscribeParams) (any, error)
	TerminalRemoteUnsubscribe(ctx context.Context, connection *Connection, req TerminalRemoteUnsubscribeParams) (any, error)
}

// MemoryService backs the memory.* RPC methods.
type MemoryService interface {
	MemorySearch(ctx context.Context, req MemorySearchParams) (any, error)
	MemoryReconcile(ctx context.Context) (any, error)
	MemoryStatus(ctx context.Context) (any, error)
	MemoryGetConfig(ctx context.Context) (any, error)
	MemoryUpdateConfig(ctx context.Context, req MemoryUpdateConfigParams) (any, error)
}

// ComputerService backs the computer.* RPC methods.
type ComputerService interface {
	ComputerHealth(ctx context.Context) (any, error)
	ComputerPermissions(ctx context.Context) (any, error)
	ComputerGetConfig(ctx context.Context) (any, error)
	ComputerUpdateConfig(ctx context.Context, req computer.FeatureConfig) (any, error)
	ComputerListDisplays(ctx context.Context) (any, error)
	ComputerListApplications(ctx context.Context) (any, error)
	ComputerListWindows(ctx context.Context, req ComputerListWindowsParams) (any, error)
	ComputerCaptureDisplay(ctx context.Context, req ComputerCaptureDisplayParams) (any, error)
	ComputerCaptureWindow(ctx context.Context, req ComputerCaptureWindowParams) (any, error)
	ComputerGetUITree(ctx context.Context, req ComputerGetUITreeParams) (any, error)
	ComputerPerformAction(ctx context.Context, req computer.AccessibilityActionRequest) (any, error)
	ComputerFocusWindow(ctx context.Context, req ComputerFocusWindowParams) (any, error)
	ComputerLaunchApplication(ctx context.Context, req ComputerLaunchApplicationParams) (any, error)
	ComputerMovePointer(ctx context.Context, req ComputerMovePointerParams) (any, error)
	ComputerClick(ctx context.Context, req computer.ClickRequest) (any, error)
	ComputerDrag(ctx context.Context, req computer.DragRequest) (any, error)
	ComputerScroll(ctx context.Context, req computer.ScrollRequest) (any, error)
	ComputerTypeText(ctx context.Context, req ComputerTypeTextParams) (any, error)
	ComputerSendKey(ctx context.Context, req computer.KeyRequest) (any, error)
	ComputerReadClipboard(ctx context.Context) (any, error)
	ComputerWriteClipboard(ctx context.Context, req computer.ClipboardContent) (any, error)
	ComputerOpenPermissionSettings(ctx context.Context, req ComputerOpenPermissionSettingsParams) (any, error)
}

// ContextService backs the context.* RPC methods.
type ContextService interface {
	ContextGetState() (any, error)
	ContextSetCurrentOrg(ctx context.Context, req ContextSetCurrentOrgParams) (any, error)
	ContextSetActiveProject(ctx context.Context, req ContextSetActiveProjectParams) (any, error)
	ContextSetActiveFile(ctx context.Context, req ContextSetActiveFileParams) (any, error)
}

// ProjectService backs the project.* RPC methods.
type ProjectService interface {
	ProjectList(ctx context.Context, req ProjectListParams) (any, error)
	ProjectListWithWorkspaces(ctx context.Context, req ProjectListWithWorkspacesParams) (any, error)
	ProjectGetListPreferences(ctx context.Context, req ProjectGetListPreferencesParams) (any, error)
	ProjectSetListPreferences(ctx context.Context, req ProjectSetListPreferencesParams) (any, error)
}

// SystemService backs the daemon./app./agent./tokenUsage./node. RPC methods.
type SystemService interface {
	SystemDaemonPing() (any, error)
	SystemFrontendEventsStream(ctx context.Context, connection *Connection) (any, error)
	SystemAgentListDetectionStatuses(ctx context.Context, params json.RawMessage) (any, error)
	SystemCLIToolListStatuses(ctx context.Context, params json.RawMessage) (any, error)
	SystemCLIToolInstall(ctx context.Context, req SystemCLIToolInstallParams) (any, error)
	SystemCLIToolUninstall(ctx context.Context, req SystemCLIToolUninstallParams) (any, error)
	SystemIntegrationGitHubStatus(ctx context.Context, params json.RawMessage) (any, error)
	SystemAppPersistAuthTokens(ctx context.Context, params json.RawMessage) (any, error)
	SystemAppGetAccessToken(ctx context.Context) (any, error)
	SystemAppCheckAuthStatus(ctx context.Context) (any, error)
	SystemAppLogout(ctx context.Context) (any, error)
	SystemAppReloadAuthConfig(ctx context.Context) (any, error)
	SystemAgentListModels(ctx context.Context, req SystemAgentListModelsParams) (any, error)
	SystemTokenUsageDebugState(ctx context.Context) (any, error)
	SystemProjectList(ctx context.Context, req SystemProjectListParams) (any, error)
	SystemNodeList(ctx context.Context, req SystemNodeListParams) (any, error)
}
