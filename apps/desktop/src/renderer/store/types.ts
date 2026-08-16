import type { StateCreator } from "zustand";
import type { ExternalAppId } from "../../shared/contracts/externalApps";
import type { ProjectRecord, WorkspacePullRequestSummary, WorkspaceRecord } from "../api/types";
import type { WorkspaceProjectRecord } from "../features/project/model/projectTypes";
import type { WorkspaceGitChangeTotals, WorkspaceItem } from "../features/workspace/model/workspaceTypes";
import type { DesktopAgentKind } from "../helpers/agentSettings";
import type { DaemonLocalFolder, DaemonWorkspacePullRequest } from "../rpc/daemonTypes";

// Re-export chat-domain types from their canonical location.
export type { AvailableCommand, AvailableModel, ChatMessage } from "./chatTypes";

/**
 * Synthetic project id used for local (non-git) folder workspaces. Folder
 * workspaces are daemon-owned rows (kind="folder") mapped into the workspace
 * list but have no real backend project, so they share this sentinel value.
 */
export type {
  WorkspaceProjectCommand,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
} from "../features/project/model/projectTypes";
export { LOCAL_FOLDER_PROJECT_ID } from "../features/project/model/projectTypes";

export type {
  WorkspaceGitChangeTotals,
  WorkspaceItem,
  WorkspaceLifecycleState,
  WorkspaceHealth,
} from "../features/workspace/model/workspaceTypes";

export type DiffFileChangeKind = "added" | "modified" | "deleted" | "renamed";

export type DiffTabSource =
  | { kind: "workspace" }
  | { kind: "commit"; commitHash: string }
  | { kind: "branch"; targetBranch: string };

export type FileDiffEntry = {
  path: string;
  oldContent: string;
  newContent: string;
  changeKind: DiffFileChangeKind;
  additions: number;
  deletions: number;
};

/** Visual mode for one agent-chat tab/session attachment. */
export type AgentChatSessionView = "full" | "subagent-detail";

export type WorkspaceTabDataByKind = {
  session: {
    sessionId?: string;
    agentKind?: DesktopAgentKind;
    isInitializing?: boolean;
  };
  diff: {
    path: string;
    oldContent: string;
    newContent: string;
    source?: DiffTabSource;
    isTemporary: boolean;
    files?: FileDiffEntry[];
  };
  file: {
    path: string;
    content: string;
    savedContent: string;
    isDirty: boolean;
    isTemporary: boolean;
    isUnsupported?: boolean;
    unsupportedReason?: "type" | "size";
    isDeleted?: boolean;
    /** True when the file is git-ignored; suppresses diff gutter decorations. */
    isIgnored?: boolean;
  };
  image: { path: string; dataUrl: string; isTemporary: boolean };
  video: { path: string; dataUrl: string; isTemporary: boolean };
  audio: { path: string; dataUrl: string; isTemporary: boolean };
  terminal: {
    title: string;
    /** Stable terminal pane identity used by observer correlation. */
    paneId?: string;
    /** Backend terminal runtime session id bound to this tab. */
    sessionId?: string;
    launchCommand?: string;
    agentKind?: DesktopAgentKind;
    /** When true, auto-rename from terminal commands/paths is suppressed. */
    userRenamed?: boolean;
  };
  browser: {
    url: string;
    faviconUrl?: string;
  };
  "agent-chat": {
    /** Single source of truth for agent-chat identity: one live/runtime session id per tab. */
    sessionId?: string;
    cwd: string;
    userRenamed?: boolean;
    sessionView?: AgentChatSessionView;
    subagentAgentId?: string;
    subagentParentSessionId?: string;
  };
};

export type WorkspaceTabBase = {
  id: string;
  workspaceId: string;
  title: string;
  pinned: boolean;
};

export type WorkspaceTab =
  | (WorkspaceTabBase & {
      kind: "session";
      data: WorkspaceTabDataByKind["session"];
    })
  | (WorkspaceTabBase & {
      kind: "diff";
      data: WorkspaceTabDataByKind["diff"];
    })
  | (WorkspaceTabBase & {
      kind: "file";
      data: WorkspaceTabDataByKind["file"];
    })
  | (WorkspaceTabBase & {
      kind: "image";
      data: WorkspaceTabDataByKind["image"];
    })
  | (WorkspaceTabBase & {
      kind: "video";
      data: WorkspaceTabDataByKind["video"];
    })
  | (WorkspaceTabBase & {
      kind: "audio";
      data: WorkspaceTabDataByKind["audio"];
    })
  | (WorkspaceTabBase & {
      kind: "terminal";
      data: WorkspaceTabDataByKind["terminal"];
    })
  | (WorkspaceTabBase & {
      kind: "browser";
      data: WorkspaceTabDataByKind["browser"];
    })
  | (WorkspaceTabBase & {
      kind: "agent-chat";
      data: WorkspaceTabDataByKind["agent-chat"];
    });

export type OpenWorkspaceTabInput =
  | {
      workspaceId?: string;
      kind: "diff";
      path: string;
      changeKind: DiffFileChangeKind;
      additions: number;
      deletions: number;
      oldContent?: string;
      newContent?: string;
      diffSource?: DiffTabSource;
      temporary?: boolean;
      files?: FileDiffEntry[];
    }
  | {
      workspaceId?: string;
      kind: "file";
      path: string;
      content?: string;
      temporary?: boolean;
      isUnsupported?: boolean;
      unsupportedReason?: "type" | "size";
      /** When true, diff gutter decorations will be suppressed for this file. */
      isIgnored?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "image";
      path: string;
      dataUrl: string;
      temporary?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "video";
      path: string;
      dataUrl: string;
      temporary?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "audio";
      path: string;
      dataUrl: string;
      temporary?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "terminal";
      title?: string;
      sessionId?: string;
      launchCommand?: string;
      agentKind?: DesktopAgentKind;
      reuseExisting?: boolean;
      tabId?: string;
      paneId?: string;
    }
  | {
      workspaceId?: string;
      kind: "browser";
      url?: string;
      reuseExisting?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "agent-chat";
      title?: string;
      /** Working directory for the pi agent process. Defaults to workspace worktree path. */
      cwd?: string;
      /** Single session id used for both live attach and persisted Pi resume. */
      sessionId?: string;
      sessionView?: AgentChatSessionView;
      subagentAgentId?: string;
      subagentParentSessionId?: string;
    };

export type WorkspaceStoreState = {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
  selectedProjectId: string;
  selectedWorkspaceId: string;
  isProjectsLoaded: boolean;
  orderedWorkspaceIds: string[];
  setSelectedProjectId: (projectId: string) => void;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  load: (organizationId: string, projects: ProjectRecord[], workspaces: WorkspaceRecord[]) => void;
  createProject: (input: {
    name: string;
    source: "local" | "remote";
    path?: string;
    gitUrl?: string;
    backendProject: WorkspaceProjectRecord;
    organizationId: string;
  }) => void;
  deleteProject: (projectId: string) => void;
  updateProjectConfig: (
    projectId: string,
    config: Pick<
      WorkspaceProjectRecord,
      "name" | "worktreePath" | "contextEnabled" | "icon" | "color" | "setupScript" | "postScript" | "commands"
    >,
  ) => void;
  addWorkspace: (input: {
    organizationId?: string;
    projectId?: string;
    repoId?: string;
    name: string;
    sourceBranch: string;
    branch: string;
    worktreePath?: string;
    nodeId?: string;
    workspaceId: string;
    status?: WorkspaceRecord["status"];
    preserveOnMissingSnapshot?: boolean;
  }) => void;
  removeWorkspace: (input: {
    projectId?: string;
    repoId?: string;
    workspaceId: string;
  }) => void;
  renameWorkspace: (input: {
    projectId?: string;
    repoId?: string;
    workspaceId: string;
    name: string;
  }) => void;
  renameWorkspaceBranch: (input: {
    projectId?: string;
    repoId?: string;
    workspaceId: string;
    branch: string;
  }) => void;
  reorderWorkspace: (input: {
    draggedWorkspaceId: string;
    targetWorkspaceId: string;
    position: "before" | "after";
  }) => void;
  loadLocalFolders: (folders: DaemonLocalFolder[]) => void;
  addLocalFolder: (folder: DaemonLocalFolder) => void;
  removeLocalFolder: (id: string) => void;
  setOrderedWorkspaceIds: (ids: string[]) => void;
};

export type WorkspaceStorePersistedState = Record<string, never>;

export type WorkspaceStoreActions = Pick<
  WorkspaceStoreState,
  | "setSelectedProjectId"
  | "setSelectedWorkspaceId"
  | "load"
  | "createProject"
  | "deleteProject"
  | "updateProjectConfig"
  | "addWorkspace"
  | "removeWorkspace"
  | "renameWorkspace"
  | "renameWorkspaceBranch"
  | "reorderWorkspace"
  | "loadLocalFolders"
  | "addLocalFolder"
  | "removeLocalFolder"
  | "setOrderedWorkspaceIds"
>;

export type WorkspaceStoreCreator = StateCreator<
  WorkspaceStoreState,
  [["zustand/immer", never]],
  [],
  WorkspaceStoreState
>;

export type WorkspaceStoreSetState = Parameters<WorkspaceStoreCreator>[0];
export type WorkspaceStoreGetState = Parameters<WorkspaceStoreCreator>[1];
