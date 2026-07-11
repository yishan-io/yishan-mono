import type { NotificationPreferences } from "../../shared/notifications/notificationPreferences";
import type * as Rpc from "./daemonTypes";

export type ApiSubscriptionHandlers = {
  onData: (event: unknown) => void;
  onError?: (error: unknown) => void;
};

type DaemonRpcSubscription = {
  unsubscribe: () => void;
};

export type DaemonRpcClient = {
  app: {
    getDefaultWorktreeLocation: (input?: unknown) => Promise<{ worktreePath: string }>;
    checkAgentGlobalConfigExternalDirectoryPermission: (input?: unknown) => Promise<unknown>;
    ensureAgentGlobalConfigExternalDirectoryPermission: (input?: unknown) => Promise<unknown>;
    persistAuthTokens: (input: Rpc.PersistAuthTokensInput) => Promise<{ ok: boolean }>;
    getAccessToken: (input?: unknown) => Promise<Rpc.GetAccessTokenOutput>;
    checkAuthStatus: (input?: unknown) => Promise<Rpc.CheckAuthStatusOutput>;
    logout: (input?: unknown) => Promise<Rpc.LogoutOutput>;
    reloadAuthConfig: (input?: unknown) => Promise<Rpc.ReloadAuthConfigOutput>;
  };
  computer: {
    permissions: (input?: unknown) => Promise<Rpc.ComputerPermissionStatus>;
    openPermissionSettings: (input: { permission: string }) => Promise<{ ok: boolean }>;
    getConfig: (input?: unknown) => Promise<Rpc.ComputerUseFeatureConfig>;
    updateConfig: (input: Rpc.ComputerUseFeatureConfig) => Promise<{ ok: boolean }>;
  };
  context: {
    getState: () => Promise<unknown>;
    setCurrentOrg: (orgId: string) => Promise<unknown>;
    setActiveProject: (projectId: string) => Promise<unknown>;
    setActiveFile: (filePath: string) => Promise<unknown>;
  };
  workspace: {
    list: (input?: unknown) => Promise<Rpc.DaemonWorkspace[]>;
    refreshPullRequest: (input: Rpc.WorkspaceRefreshPullRequestInput) => Promise<Rpc.DaemonWorkspace>;
    createWorkspace: (input: Rpc.WorkspaceCreateInput) => Promise<Rpc.WorkspaceCreateResponse>;
    close: (input: Rpc.WorkspaceCloseExecutionInput) => Promise<Rpc.WorkspaceCloseExecutionResponse | undefined>;
    syncContextLink: (input: Rpc.WorkspaceSyncContextLinkInput) => Promise<Rpc.WorkspaceSyncContextLinkResponse>;
    health: (input: Rpc.WorkspaceHealthInput) => Promise<Rpc.WorkspaceHealthOutput>;
    repair: (input: Rpc.WorkspaceRepairInput) => Promise<Rpc.WorkspaceRepairOutput>;
    forget: (input: Rpc.WorkspaceForgetInput) => Promise<Rpc.WorkspaceForgetOutput>;
    openProject: (input: Rpc.WorkspaceOpenProjectInput) => Promise<Rpc.WorkspaceOpenProjectOutput>;
    closeProject: (input: Rpc.WorkspaceCloseProjectInput) => Promise<Rpc.WorkspaceCloseProjectOutput>;
  };
  file: {
    listFiles: (input: Rpc.FileListInput) => Promise<Rpc.FileListResponse>;
    listFilesBatch: (input: Rpc.FileListBatchInput) => Promise<Rpc.FileListBatchResponse>;
    searchFiles: (input: Rpc.FileSearchInput) => Promise<Rpc.FileSearchResult[]>;
    readFile: (input: Rpc.FileReadInput) => Promise<Rpc.FileReadResponse>;
    writeFile: (input: Rpc.FileWriteInput) => Promise<Rpc.FileWriteResponse>;
    createFile: (input: Rpc.FileWriteInput) => Promise<Rpc.FileMutationOkResponse>;
    createFolder: (input: Rpc.FileCreateFolderInput) => Promise<Rpc.FileMutationOkResponse>;
    renameEntry: (input: Rpc.FileRenameInput) => Promise<Rpc.FileMutationOkResponse>;
    deleteEntry: (input: Rpc.FileDeleteInput) => Promise<Rpc.FileMutationOkResponse>;
    readDiff: (input: Rpc.FileReadInput) => Promise<Rpc.FileDiffResponse>;
  };
  git: {
    inspect: (input: Rpc.GitInspectInput) => Promise<Rpc.GitInspectResponse>;
    inspectPath: (input: Rpc.GitInspectPathInput) => Promise<Rpc.GitInspectResponse>;
    listChanges: (input: Rpc.GitWorktreeInput) => Promise<Rpc.GitChangesBySection>;
    trackChanges: (input: Rpc.GitPathsInput) => Promise<Rpc.GitStatusOperationResponse>;
    unstageChanges: (input: Rpc.GitPathsInput) => Promise<Rpc.GitStatusOperationResponse>;
    revertChanges: (input: Rpc.GitPathsInput) => Promise<Rpc.GitStatusOperationResponse>;
    commitChanges: (input: Rpc.GitCommitInput) => Promise<string>;
    getBranchStatus: (input: Rpc.GitWorktreeInput) => Promise<Rpc.GitBranchStatusResponse>;
    listCommitsToTarget: (input: Rpc.GitTargetBranchInput) => Promise<Rpc.GitCommitComparisonResponse>;
    getBranchDiffSummary: (input: Rpc.GitTargetBranchInput) => Promise<Rpc.GitBranchDiffSummaryResponse>;
    listBranches: (input: Rpc.GitWorktreeInput) => Promise<Rpc.GitBranchListResponse>;
    pushBranch: (input: Rpc.GitWorktreeInput) => Promise<string>;
    publishBranch: (input: Rpc.GitWorktreeInput) => Promise<string>;
    getAuthorName: (input: Rpc.GitWorktreeInput) => Promise<string | null>;
    readCommitDiff: (input: Rpc.GitCommitDiffInput) => Promise<Rpc.GitDiffContentResponse>;
    readBranchComparisonDiff: (input: Rpc.GitBranchDiffInput) => Promise<Rpc.GitDiffContentResponse>;
    renameBranch: (input: Rpc.GitRenameBranchInput) => Promise<Rpc.GitStatusOperationResponse>;
    mergePullRequest: (input: Rpc.GitPrMergeInput) => Promise<{ output: string }>;
    closePullRequest: (input: Rpc.GitPrCloseInput) => Promise<{ output: string }>;
  };
  terminal: {
    createSession: (input: Rpc.TerminalCreateSessionInput) => Promise<Rpc.TerminalCreateSessionResponse>;
    writeInput: (input: Rpc.TerminalWriteInput) => Promise<Rpc.TerminalMutationOkResponse>;
    resize: (input: Rpc.TerminalResizeInput) => Promise<Rpc.TerminalMutationOkResponse>;
    readOutput: (input: Rpc.TerminalReadOutputInput) => Promise<Rpc.TerminalReadOutputResponse>;
    closeSession: (input: Rpc.TerminalCloseInput) => Promise<Rpc.TerminalMutationOkResponse>;
    killProcess: (input: Rpc.TerminalKillProcessInput) => Promise<Rpc.TerminalMutationOkResponse>;
    listDetectedPorts: (input?: unknown) => Promise<Rpc.TerminalDetectedPort[]>;
    setActiveWorkspace: (input: Rpc.SetActiveWorkspaceInput) => Promise<Rpc.SetActiveWorkspaceResponse>;
    getResourceUsage: (input?: unknown) => Promise<Rpc.TerminalResourceUsageSnapshot>;
    listSessions: (input?: Rpc.TerminalListSessionsInput) => Promise<Rpc.TerminalSessionSummary[]>;
    subscribeOutput: {
      subscribe: (input: { sessionId: string }, handlers: ApiSubscriptionHandlers) => DaemonRpcSubscription;
    };
    subscribeSessions: {
      subscribe: (input: undefined, handlers: ApiSubscriptionHandlers) => DaemonRpcSubscription;
    };
  };
  chat: {
    ensureWorkspaceChatSession: (input: unknown) => Promise<{ sessionId: string; capabilities?: unknown }>;
    runWorkspaceChatPrompt: (input: unknown) => Promise<unknown>;
    closeAgentSession: (input: { sessionId: string; deleteRecord?: boolean }) => Promise<unknown>;
  };
  pi: {
    start: (input: { sessionId: string; tabId: string; workspaceId: string; cwd: string; piSessionId?: string }) => Promise<{ sessionId: string }>;
    stop: (input: { sessionId: string }) => Promise<{ ok: boolean }>;
    send: (input: { sessionId: string; command: unknown }) => Promise<unknown>;
    listSessions: (input: Rpc.PiListSessionsInput) => Promise<Rpc.PiSessionSummary[]>;
  };
  agent: {
    listDetectionStatuses: (input?: unknown) => Promise<unknown>;
    listModels: (input?: { agentKind?: string; forceRefresh?: boolean }) => Promise<{
      agentKind: string;
      models: Array<{ id: string; name: string }>;
      source: string;
      fetchedAt: number;
      cacheExpiry: number;
    }>;
  };
  cliTools: {
    listStatuses: (input?: { refresh?: boolean }) => Promise<
      Array<{
        toolId: string;
        category: string;
        label: string;
        installed: boolean;
        version?: string;
        authenticated?: boolean;
        account?: string;
        statusDetail: string;
        supportsToggle?: boolean;
      }>
    >;
  };
  integration: {
    githubStatus: (input?: { refresh?: boolean }) => Promise<{
      installed: boolean;
      loggedIn: boolean;
      username?: string;
      statusDetail: string;
    }>;
  };
  notification: {
    getNotificationPreferences: (input?: unknown) => Promise<NotificationPreferences>;
    updateNotificationPreferences: (input: unknown) => Promise<NotificationPreferences>;
  };
  events: {
    frontendStream: {
      subscribe: (
        input: undefined,
        handlers: {
          onData: (event: { topic: string; payload: unknown }) => void;
          onError?: (error: unknown) => void;
        },
      ) => DaemonRpcSubscription;
    };
  };
  skill: {
    list: (input?: undefined) => Promise<Rpc.SkillListResponse>;
    info: (input: { name: string }) => Promise<Rpc.SkillInfo>;
    detail: (input: { name: string }) => Promise<Rpc.SkillDetail>;
    add: (input: { source: string }) => Promise<Rpc.SkillMutationOkResponse>;
    remove: (input: { name: string }) => Promise<Rpc.SkillMutationOkResponse>;
    update: (input: { name: string }) => Promise<Rpc.SkillMutationOkResponse>;
  };
  memory: {
    search: (input: Rpc.MemorySearchInput) => Promise<Rpc.MemorySearchResult[]>;
    reconcile: (input?: unknown) => Promise<Rpc.MemoryReconcileResult>;
    status: (input?: unknown) => Promise<{ enabled: boolean }>;
    updateConfig: (input: Rpc.MemoryUpdateConfigInput) => Promise<{ ok: boolean }>;
    getConfig: (input?: unknown) => Promise<Rpc.MemoryConfig>;
  };
};
