/**
 * Type-level conformance: the owning command modules satisfy the Phase 1
 * command contracts. If a contract member drifts from its module export (or
 * vice versa), this file fails typecheck.
 *
 * Multi-module features use `Pick<Contract, Keys>` per owning module so each
 * module is checked against exactly the surface it provides.
 */

import type { AgentCommands } from "./agent";
import type { ProjectCommands } from "./project";
import type { SelectionCommands } from "./selection";
import type { TerminalCommands } from "./terminal";
import type { WorkbenchCommands } from "./workbench";
import type { WorkspaceCommands } from "./workspace";

import type * as agentChatCommands from "../agentChatCommands";
import type * as agentCommands from "../agentCommands";
import type * as chatCommands from "../chatCommands";
import type * as localFolderCommands from "../localFolderCommands";
import type * as projectCommands from "../projectCommands";
import type * as selectionCommands from "../selectionCommands";
import type * as tabCommands from "../tabCommands";
import type * as terminalCommands from "../terminalCommands";
import type * as whiteboardCommands from "../whiteboardCommands";
import type * as workspaceCloseCommand from "../workspaceCloseCommand";
import type * as workspaceCommands from "../workspaceCommands";
import type * as workspaceCreateCommand from "../workspaceCreateCommand";
import type * as workspaceTabSync from "../workspaceTabSync";

/** Assert a type-level boolean condition; fails typecheck when not true. */
export type Expect<T extends true> = T;

// Workspace: four owning modules.
type _WorkspaceCommandsConforms = Expect<
  typeof workspaceCommands extends Pick<
    WorkspaceCommands,
    | "refreshWorkspaceGitChanges"
    | "refreshWorkspacePullRequest"
    | "setDisplayRepoIds"
    | "setLastUsedExternalAppId"
    | "setLeftPaneWidth"
    | "setRightPaneWidth"
    | "toggleLeftPaneVisibility"
    | "toggleRightPaneVisibility"
    | "activateWorkspacePane"
    | "openCreateWorkspaceDialog"
    | "focusWorkspaceFileTree"
    | "openWorkspaceFileSearch"
    | "selectFolderInFileTree"
    | "deleteSelectedFileTreeEntry"
    | "undoFileTreeOperation"
    | "renameWorkspace"
    | "reorderWorkspace"
    | "renameWorkspaceBranch"
  >
    ? true
    : false
>;
type _WorkspaceCreateCommandConforms = Expect<
  typeof workspaceCreateCommand extends Pick<WorkspaceCommands, "createWorkspace" | "notifyLifecycleScriptWarnings">
    ? true
    : false
>;
type _WorkspaceCloseCommandConforms = Expect<
  typeof workspaceCloseCommand extends Pick<WorkspaceCommands, "closeWorkspace"> ? true : false
>;
type _LocalFolderCommandsConforms = Expect<
  typeof localFolderCommands extends Pick<
    WorkspaceCommands,
    "createLocalFolderImport" | "openFoldersForSnapshot" | "restoreFolderSelectionIfNeeded" | "deleteLocalFolder"
  >
    ? true
    : false
>;

// Project: single owning module.
type _ProjectCommandsConforms = Expect<typeof projectCommands extends ProjectCommands ? true : false>;

// Selection: single owning module.
type _SelectionCommandsConforms = Expect<typeof selectionCommands extends SelectionCommands ? true : false>;

// Agent: three owning modules.
type _AgentChatCommandsConforms = Expect<
  typeof agentChatCommands extends Pick<
    AgentCommands,
    | "ensurePiSession"
    | "findTabWithSession"
    | "setPiSessionUnsubscribe"
    | "clearPiSessionHandle"
    | "reattachPiSession"
    | "stopPiSession"
    | "sendAgentPrompt"
    | "abortAgent"
    | "compactAgent"
    | "respondToAgentExtensionUiRequest"
    | "fetchAgentModels"
    | "fetchAgentState"
    | "fetchAgentMessages"
  >
    ? true
    : false
>;
type _AgentCommandsConforms = Expect<
  typeof agentCommands extends Pick<AgentCommands, "listAgentDetectionStatuses" | "listAgentModels"> ? true : false
>;
type _ChatCommandsConforms = Expect<
  typeof chatCommands extends Pick<
    AgentCommands,
    | "ensureChatSession"
    | "runChatPrompt"
    | "closeAgentSession"
    | "getChatMessages"
    | "appendChatMessages"
    | "updateChatMessage"
    | "setChatAvailableCommands"
    | "setChatAvailableModels"
    | "setChatCurrentModel"
    | "createWorkspaceChatEventHandler"
  >
    ? true
    : false
>;

// Terminal: single owning module.
type _TerminalCommandsConforms = Expect<typeof terminalCommands extends TerminalCommands ? true : false>;

// Workbench: three owning modules.
type _TabCommandsConforms = Expect<
  typeof tabCommands extends Pick<
    WorkbenchCommands,
    | "createTab"
    | "closeTab"
    | "closeOtherTabs"
    | "closeAllTabs"
    | "setSelectedTab"
    | "openTab"
    | "openChatFileTab"
    | "openTabInOppositePane"
    | "toggleTabPinned"
    | "promoteTemporaryTab"
    | "reorderTab"
    | "renameTab"
    | "setBrowserTabFaviconUrl"
    | "setBrowserTabUrl"
    | "renameTabsForEntryRename"
    | "updateFileTabContent"
    | "markFileTabSaved"
    | "refreshFileTabFromDisk"
    | "refreshDiffTabContent"
  >
    ? true
    : false
>;
type _WhiteboardCommandsConforms = Expect<
  typeof whiteboardCommands extends Pick<WorkbenchCommands, "createNewWhiteboard" | "resolveNextWhiteboardPath">
    ? true
    : false
>;
type _WorkspaceTabSyncConforms = Expect<
  typeof workspaceTabSync extends Pick<WorkbenchCommands, "syncTabStoreWithWorkspace"> ? true : false
>;
