import type * as localFolderCommands from "./localFolderCommands";
import type * as workspaceCloseCommand from "./workspaceCloseCommand";
/**
 * WorkspaceCommands — the public command surface for the Workspace feature.
 *
 * Phase 1 contract: declares the operations the Workspace feature exposes to
 * UI and flows. The owning modules (workspaceCommands, workspaceCreateCommand,
 * workspaceCloseCommand, localFolderCommands) satisfy this contract today;
 * `contracts/conformance.ts` enforces that at typecheck time.
 *
 * The legacy composition hub (`commands/composition.ts`) exposes a subset of
 * this surface; direct consumers import from the owning modules. This contract
 * is the feature's public entry and will move to `features/workspace/commands/`
 * when the feature directory forms (Phases 4+).
 */
import type * as workspaceCommands from "./workspaceCommands";
import type * as workspaceCreateCommand from "./workspaceCreateCommand";

export type WorkspaceCommands = {
  refreshWorkspaceGitChanges: typeof workspaceCommands.refreshWorkspaceGitChanges;
  refreshWorkspacePullRequest: typeof workspaceCommands.refreshWorkspacePullRequest;
  listPullRequestHistory: typeof workspaceCommands.listPullRequestHistory;
  subscribeOpenCreateWorkspaceDialog: typeof workspaceCommands.subscribeOpenCreateWorkspaceDialog;
  setDisplayRepoIds: typeof workspaceCommands.setDisplayRepoIds;
  setLastUsedExternalAppId: typeof workspaceCommands.setLastUsedExternalAppId;
  setLeftPaneWidth: typeof workspaceCommands.setLeftPaneWidth;
  setRightPaneWidth: typeof workspaceCommands.setRightPaneWidth;
  toggleLeftPaneVisibility: typeof workspaceCommands.toggleLeftPaneVisibility;
  toggleRightPaneVisibility: typeof workspaceCommands.toggleRightPaneVisibility;
  activateWorkspacePane: typeof workspaceCommands.activateWorkspacePane;
  openCreateWorkspaceDialog: typeof workspaceCommands.openCreateWorkspaceDialog;
  focusWorkspaceFileTree: typeof workspaceCommands.focusWorkspaceFileTree;
  openWorkspaceFileSearch: typeof workspaceCommands.openWorkspaceFileSearch;
  selectFolderInFileTree: typeof workspaceCommands.selectFolderInFileTree;
  deleteSelectedFileTreeEntry: typeof workspaceCommands.deleteSelectedFileTreeEntry;
  undoFileTreeOperation: typeof workspaceCommands.undoFileTreeOperation;
  renameWorkspace: typeof workspaceCommands.renameWorkspace;
  reorderWorkspace: typeof workspaceCommands.reorderWorkspace;
  renameWorkspaceBranch: typeof workspaceCommands.renameWorkspaceBranch;
  createWorkspace: typeof workspaceCreateCommand.createWorkspace;
  notifyLifecycleScriptWarnings: typeof workspaceCreateCommand.notifyLifecycleScriptWarnings;
  closeWorkspace: typeof workspaceCloseCommand.closeWorkspace;
  createLocalFolderImport: typeof localFolderCommands.createLocalFolderImport;
  openFoldersForSnapshot: typeof localFolderCommands.openFoldersForSnapshot;
  restoreFolderSelectionIfNeeded: typeof localFolderCommands.restoreFolderSelectionIfNeeded;
  deleteLocalFolder: typeof localFolderCommands.deleteLocalFolder;
};
