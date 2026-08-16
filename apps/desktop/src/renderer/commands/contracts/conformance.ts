/**
 * Type-level conformance: the owning command modules satisfy the Phase 1
 * command contracts. If a contract member drifts from its module export (or
 * vice versa), this file fails typecheck.
 *
 * Multi-module features use `Pick<Contract, Keys>` per owning module so each
 * module is checked against exactly the surface it provides.
 */

import type { ProjectCommands } from "../../features/project/commands/contract";
import type { WorkspaceCommands } from "../../features/workspace/commands/contract";
import type { SelectionCommands } from "../../features/workspace/commands/selectionContract";
import type { AgentCommands } from "../../features/agent/commands/contract";
import type { TerminalCommands } from "../../features/terminal/commands/contract";
import type { FileCommands } from "../../features/files/commands/contract";
import type { WorkbenchCommands } from "../../features/workbench/commands/contract";
import type { SessionCommands } from "../../features/session/commands/contract";
import type { ScheduledJobCommands } from "../../features/scheduled-job/commands/contract";

import type * as projectCommands from "../../features/project/commands/projectCommands";
import type * as localFolderCommands from "../../features/workspace/commands/localFolderCommands";
import type * as selectionCommands from "../../features/workspace/commands/selectionCommands";
import type * as workspaceCloseCommand from "../../features/workspace/commands/workspaceCloseCommand";
import type * as workspaceCommands from "../../features/workspace/commands/workspaceCommands";
import type * as workspaceCreateCommand from "../../features/workspace/commands/workspaceCreateCommand";
import type * as agentChatCommands from "../../features/agent/commands/agentChatCommands";
import type * as agentCommands from "../../features/agent/commands/agentCommands";
import type * as chatCommands from "../../features/agent/commands/chatCommands";
import type * as tabCommands from "../../features/workbench/commands/tabCommands";
import type * as terminalCommands from "../../features/terminal/commands/terminalCommands";
import type * as fileCommands from "../../features/files/commands/fileCommands";
import type * as sessionCommands from "../../features/session/commands/sessionCommands";
import type * as scheduledJobCommands from "../../features/scheduled-job/commands/scheduledJobCommands";
import type * as whiteboardCommands from "../../features/workbench/commands/whiteboardCommands";
import type * as workspaceTabSync from "../../features/workbench/commands/workspaceTabSync";

/** Assert a type-level boolean condition; fails typecheck when not true. */
export type Expect<T extends true> = T;

// Workspace: four owning modules.
type _WorkspaceCommandsConforms = Expect<
  typeof workspaceCommands extends Pick<
    WorkspaceCommands,
    | "refreshWorkspaceGitChanges"
    | "refreshWorkspacePullRequest"
    | "listPullRequestHistory"
    | "subscribeOpenCreateWorkspaceDialog"
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
    | "startAgentChatSession"
    | "restartAgentSessionForProvider"
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

// Files: single owning module.
type _FileCommandsConforms = Expect<typeof fileCommands extends FileCommands ? true : false>;

// Session: single owning module.
type _SessionCommandsConforms = Expect<typeof sessionCommands extends SessionCommands ? true : false>;

// ScheduledJob: single owning module.
type _ScheduledJobCommandsConforms = Expect<typeof scheduledJobCommands extends ScheduledJobCommands ? true : false>;

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
