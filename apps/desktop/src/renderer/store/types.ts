import type { StateCreator } from "zustand";
import type { ExternalAppId } from "../../shared/contracts/externalApps";
import type { ProjectRecord, WorkspaceRecord } from "../api/types";

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
  privateContextEnabled?: boolean;
  defaultBranch?: string | null;
  icon?: string | null;
  iconBgColor?: string | null;
  setupScript?: string | null;
  postScript?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
};

export type AvailableCommand = {
  name: string;
  description: string;
};

export type AvailableModel = {
  id: string;
  name: string;
};

export type RepoWorkspaceItem = {
  id: string;
  projectId?: string;
  repoId: string;
  name: string;
  title: string;
  sourceBranch: string;
  branch: string;
  summaryId: string;
  worktreePath?: string;
  kind?: "managed" | "local";
};

export type DiffFileChangeKind = "added" | "modified" | "deleted";

export type WorkspaceGitChangeTotals = {
  additions: number;
  deletions: number;
};

export type WorkspaceTabDataByKind = {
  session: {
    sessionId?: string;
    agentKind?: "opencode" | "codex" | "claude";
    isInitializing?: boolean;
  };
  diff: { path: string; oldContent: string; newContent: string };
  file: { path: string; content: string; savedContent: string; isDirty: boolean; isTemporary: boolean };
  terminal: {
    title: string;
    /** Stable terminal pane identity used by observer correlation. */
    paneId?: string;
    /** Backend terminal runtime session id bound to this tab. */
    sessionId?: string;
    launchCommand?: string;
    agentKind?: "opencode" | "codex" | "claude";
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
      kind: "terminal";
      data: WorkspaceTabDataByKind["terminal"];
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
    }
  | {
      workspaceId?: string;
      kind: "file";
      path: string;
      content?: string;
      temporary?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "terminal";
      title?: string;
      launchCommand?: string;
      agentKind?: "opencode" | "codex" | "claude";
      reuseExisting?: boolean;
    };

export type WorkspaceStoreState = {
  projects: WorkspaceProjectRecord[];
  workspaces: RepoWorkspaceItem[];
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
  setSelectedProjectId: (projectId: string) => void;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  setDisplayProjectIds: (projectIds: string[]) => void;
  setLastUsedExternalAppId: (appId: ExternalAppId) => void;
  load: (
    organizationId: string,
    projects: ProjectRecord[],
    workspaces: WorkspaceRecord[],
  ) => void;
  createProject: (input: {
    name: string;
    source: "local" | "remote";
    path?: string;
    gitUrl?: string;
    backendProject: WorkspaceProjectRecord;
  }) => void;
  deleteProject: (projectId: string) => void;
  updateProjectConfig: (
    projectId: string,
    config: Pick<
      WorkspaceProjectRecord,
      | "name"
      | "worktreePath"
      | "contextEnabled"
      | "privateContextEnabled"
      | "icon"
      | "iconBgColor"
      | "setupScript"
      | "postScript"
    >,
  ) => void;
  incrementFileTreeRefreshVersion: (workspaceWorktreePath?: string, changedRelativePaths?: string[]) => void;
  addWorkspace: (input: {
    projectId?: string;
    repoId?: string;
    name: string;
    sourceBranch: string;
    branch: string;
    worktreePath?: string;
    workspaceId: string;
  }) => void;
  deleteWorkspace: (input: {
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
  setWorkspaceGitChangesCount: (workspaceId: string, count: number) => void;
  setWorkspaceGitChangeTotals: (workspaceId: string, totals: WorkspaceGitChangeTotals) => void;
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
  "displayProjectIds" | "lastUsedExternalAppId" | "organizationPreferencesById"
>;

export type WorkspaceStoreActions = Pick<
  WorkspaceStoreState,
  | "setSelectedProjectId"
  | "setSelectedWorkspaceId"
  | "setDisplayProjectIds"
  | "setLastUsedExternalAppId"
  | "load"
  | "createProject"
  | "deleteProject"
  | "updateProjectConfig"
  | "incrementFileTreeRefreshVersion"
  | "addWorkspace"
  | "deleteWorkspace"
  | "renameWorkspace"
  | "renameWorkspaceBranch"
  | "setWorkspaceGitChangesCount"
  | "setWorkspaceGitChangeTotals"
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
