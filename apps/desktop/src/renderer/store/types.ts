import type { StateCreator } from "zustand";
import type { ExternalAppId } from "../../shared/contracts/externalApps";
import type { ProjectRecord, WorkspacePullRequestSummary, WorkspaceRecord } from "../api/types";
import type { DesktopAgentKind } from "../helpers/agentSettings";
import type { DaemonWorkspacePullRequest } from "../rpc/daemonTypes";

// Re-export chat-domain types from their canonical location.
export type { AvailableCommand, AvailableModel, ChatMessage } from "./chatTypes";

export type WorkspaceProjectCommand = {
  name: string;
  command: string;
};

export type WorkspaceProjectRecord = {
  id: string;
  name: string;
  key?: string;
  path?: string;
  missing?: boolean;
  gitUrl?: string;
  sourceType?: "git" | "git-local" | "unknown";
  repoProvider?: string | null;
  repoUrl?: string | null;
  repoKey?: string | null;
  localPath?: string | null;
  worktreePath?: string | null;
  contextEnabled?: boolean;
  defaultBranch?: string | null;
  icon?: string | null;
  color?: string | null;
  setupScript?: string | null;
  postScript?: string | null;
  commands?: WorkspaceProjectCommand[];
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
};

export type WorkspaceItem = {
  id: string;
  organizationId?: string;
  projectId?: string;
  repoId: string;
  name: string;
  title: string;
  sourceBranch: string;
  branch: string;
  summaryId: string;
  worktreePath?: string;
  nodeId?: string;
  kind?: "managed" | "local";
};

export type DiffFileChangeKind = "added" | "modified" | "deleted" | "renamed";

export type DiffTabSource =
  | { kind: "workspace" }
  | { kind: "commit"; commitHash: string }
  | { kind: "branch"; targetBranch: string };

export type WorkspaceGitChangeTotals = {
  additions: number;
  deletions: number;
};

export type WorkspaceTabDataByKind = {
  session: {
    sessionId?: string;
    agentKind?: DesktopAgentKind;
    isInitializing?: boolean;
  };
  diff: { path: string; oldContent: string; newContent: string; source?: DiffTabSource; isTemporary: boolean };
  file: {
    path: string;
    content: string;
    savedContent: string;
    isDirty: boolean;
    isTemporary: boolean;
    isUnsupported?: boolean;
    unsupportedReason?: "type" | "size";
    isDeleted?: boolean;
  };
  image: { path: string; dataUrl: string; isTemporary: boolean };
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
      kind: "terminal";
      data: WorkspaceTabDataByKind["terminal"];
    })
  | (WorkspaceTabBase & {
      kind: "browser";
      data: WorkspaceTabDataByKind["browser"];
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
    }
  | {
      workspaceId?: string;
      kind: "file";
      path: string;
      content?: string;
      temporary?: boolean;
      isUnsupported?: boolean;
      unsupportedReason?: "type" | "size";
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
      kind: "terminal";
      title?: string;
      sessionId?: string;
      launchCommand?: string;
      agentKind?: DesktopAgentKind;
      reuseExisting?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "browser";
      url?: string;
      reuseExisting?: boolean;
    };

export type WorkspaceStoreState = {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
  pullRequestByWorkspaceId: Record<string, DaemonWorkspacePullRequest | undefined>;
  latestPullRequestByWorkspaceId: Record<string, WorkspacePullRequestSummary | undefined>;
  currentBranchByWorkspaceId: Record<string, string>;
  gitChangesCountByWorkspaceId: Record<string, number>;
  gitChangeTotalsByWorkspaceId: Record<string, WorkspaceGitChangeTotals>;
  gitRefreshVersionByWorktreePath: Record<string, number>;
  fileTreeChangedRelativePathsByWorktreePath: Record<string, string[]>;
  selectedProjectId: string;
  selectedWorkspaceId: string;
  displayProjectIds: string[];
  lastUsedExternalAppId?: ExternalAppId;
  organizationPreferencesById?: Record<string, WorkspaceStoreOrganizationPreference>;
  fileTreeRefreshVersion: number;
  workspaceListHierarchyMode: "by_project" | "by_node";
  setSelectedProjectId: (projectId: string) => void;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  setDisplayProjectIds: (projectIds: string[]) => void;
  setLastUsedExternalAppId: (appId: ExternalAppId) => void;
  setWorkspaceListHierarchyMode: (mode: "by_project" | "by_node") => void;
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
      "name" | "worktreePath" | "contextEnabled" | "icon" | "color" | "setupScript" | "postScript"
      | "commands"
    >,
  ) => void;
  incrementFileTreeRefreshVersion: (workspaceWorktreePath?: string, changedRelativePaths?: string[]) => void;
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
  setWorkspaceGitChangesCount: (workspaceId: string, count: number) => void;
  setWorkspaceGitChangeTotals: (workspaceId: string, totals: WorkspaceGitChangeTotals) => void;
  setWorkspacePullRequest: (workspaceId: string, pullRequest?: DaemonWorkspacePullRequest) => void;
  setWorkspaceCurrentBranch: (workspaceId: string, branch: string) => void;
  incrementGitRefreshVersion: (workspaceWorktreePath: string) => void;
};

export type WorkspaceStoreOrganizationPreference = {
  selectedProjectId?: string;
  selectedWorkspaceId?: string;
  displayProjectIds?: string[];
  lastUsedExternalAppId?: ExternalAppId;
};

export type WorkspaceStorePersistedState = Pick<
  WorkspaceStoreState,
  "displayProjectIds" | "lastUsedExternalAppId" | "organizationPreferencesById" | "workspaceListHierarchyMode"
>;

export type WorkspaceStoreActions = Pick<
  WorkspaceStoreState,
  | "setSelectedProjectId"
  | "setSelectedWorkspaceId"
  | "setDisplayProjectIds"
  | "setLastUsedExternalAppId"
  | "setWorkspaceListHierarchyMode"
  | "load"
  | "createProject"
  | "deleteProject"
  | "updateProjectConfig"
  | "incrementFileTreeRefreshVersion"
  | "addWorkspace"
  | "removeWorkspace"
  | "renameWorkspace"
  | "renameWorkspaceBranch"
  | "reorderWorkspace"
  | "setWorkspaceGitChangesCount"
  | "setWorkspaceGitChangeTotals"
  | "setWorkspacePullRequest"
  | "setWorkspaceCurrentBranch"
  | "incrementGitRefreshVersion"
>;

export type WorkspaceStoreCreator = StateCreator<
  WorkspaceStoreState,
  [["zustand/immer", never]],
  [],
  WorkspaceStoreState
>;

export type WorkspaceStoreSetState = Parameters<WorkspaceStoreCreator>[0];
export type WorkspaceStoreGetState = Parameters<WorkspaceStoreCreator>[1];
