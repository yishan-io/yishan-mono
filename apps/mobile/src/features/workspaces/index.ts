/**
 * Public entry point for the workspaces feature.
 * External callers should use workspace screens, shared types, and approved cross-feature form helpers from here.
 */
export {
  resolveWorkspaceCreateNodeOptions,
  suggestWorkspaceCreateBranchName,
} from "./forms/workspaceCreateForm";
export type { WorkspaceCreateNodeOption } from "./forms/workspaceCreateForm";
export { WorkspaceBrowserScreen } from "./screens/WorkspaceBrowserScreen";
export type {
  Workspace,
  WorkspaceCurrentPullRequest,
  WorkspaceCurrentPullRequestCheck,
  WorkspaceCurrentPullRequestDeployment,
  WorkspaceFileContent,
  WorkspaceFileDiff,
  WorkspaceFileEntry,
  WorkspaceGitBranchList,
  WorkspaceGitChange,
  WorkspaceGitChangeKind,
  WorkspaceGitChanges,
  WorkspacePullRequestState,
  WorkspacePullRequestSummary,
  WorkspaceTerminalOutput,
  WorkspaceTerminalSession,
} from "./workspaces.types";
