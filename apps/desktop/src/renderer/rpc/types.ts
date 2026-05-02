import type { WorkspaceFileEntry } from "../../shared/contracts/rpcRequestTypes";
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
  };
  workspace: {
    list: (input?: unknown) => Promise<unknown>;
    createWorkspace: (input: Rpc.WorkspaceCreateInput) => Promise<Rpc.WorkspaceCreateResponse>;
    close: (input: Rpc.WorkspaceCloseExecutionInput) => Promise<Rpc.WorkspaceCloseExecutionResponse | undefined>;
    syncContextLink: (input: Rpc.WorkspaceSyncContextLinkInput) => Promise<Rpc.WorkspaceSyncContextLinkResponse>;
  };
  file: {
    listFiles: (input: Rpc.FileListInput) => Promise<{ files: WorkspaceFileEntry[] }>;
    listFilesBatch: (input: Rpc.FileListBatchInput) => Promise<{
      results: Array<{
        request: { relativePath: string; recursive: boolean };
        files: WorkspaceFileEntry[];
        error: string | null;
      }>;
    }>;
    readFile: (input: Rpc.FileReadInput) => Promise<Rpc.FileReadResponse>;
    writeFile: (input: Rpc.FileWriteInput) => Promise<Rpc.FileWriteResponse>;
    createFile: (input: Rpc.FileWriteInput) => Promise<Rpc.FileMutationOkResponse>;
    createFolder: (input: Rpc.FileCreateFolderInput) => Promise<Rpc.FileMutationOkResponse>;
    renameEntry: (input: Rpc.FileRenameInput) => Promise<Rpc.FileMutationOkResponse>;
    deleteEntry: (input: Rpc.FileDeleteInput) => Promise<Rpc.FileMutationOkResponse>;
    pasteEntries: (input: unknown) => Promise<Rpc.FileMutationOkResponse>;
    importEntries: (input: unknown) => Promise<Rpc.FileMutationOkResponse>;
    importFilePayloads: (input: unknown) => Promise<Rpc.FileMutationOkResponse>;
    readDiff: (input: { workspaceWorktreePath: string; relativePath: string }) => Promise<Rpc.FileDiffResponse>;
  };
  git: {
    inspect: (input: Rpc.GitInspectInput) => Promise<Rpc.GitInspectResponse>;
    listChanges: (input: Rpc.GitWorktreeInput) => Promise<Rpc.GitChangesBySection>;
    trackChanges: (input: Rpc.GitPathsInput) => Promise<Rpc.GitStatusOperationResponse>;
    unstageChanges: (input: Rpc.GitPathsInput) => Promise<Rpc.GitStatusOperationResponse>;
    revertChanges: (input: Rpc.GitPathsInput) => Promise<Rpc.GitStatusOperationResponse>;
    commitChanges: (input: Rpc.GitCommitInput) => Promise<string>;
    getBranchStatus: (input: Rpc.GitWorktreeInput) => Promise<Rpc.GitBranchStatusResponse>;
    listCommitsToTarget: (input: Rpc.GitTargetBranchInput) => Promise<Rpc.GitCommitComparisonResponse>;
    listBranches: (input: Rpc.GitWorktreeInput) => Promise<Rpc.GitBranchListResponse>;
    pushBranch: (input: Rpc.GitWorktreeInput) => Promise<string>;
    publishBranch: (input: Rpc.GitWorktreeInput) => Promise<string>;
    getAuthorName: (input: Rpc.GitWorktreeInput) => Promise<string | null>;
    readCommitDiff: (input: Rpc.GitCommitDiffInput) => Promise<Rpc.GitDiffContentResponse>;
    readBranchComparisonDiff: (input: Rpc.GitBranchDiffInput) => Promise<Rpc.GitDiffContentResponse>;
    renameBranch: (input: Rpc.GitRenameBranchInput) => Promise<Rpc.GitStatusOperationResponse>;
  };
  terminal: {
    createSession: (input?: Rpc.TerminalCreateSessionInput) => Promise<Rpc.TerminalCreateSessionResponse>;
    writeInput: (input: Rpc.TerminalWriteInput) => Promise<Rpc.TerminalMutationOkResponse>;
    resize: (input: Rpc.TerminalResizeInput) => Promise<Rpc.TerminalMutationOkResponse>;
    readOutput: (input: Rpc.TerminalReadOutputInput) => Promise<Rpc.TerminalReadOutputResponse>;
    closeSession: (input: Rpc.TerminalCloseInput) => Promise<Rpc.TerminalMutationOkResponse>;
    listDetectedPorts: (input?: unknown) => Promise<Rpc.TerminalDetectedPort[]>;
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
  agent: {
    listDetectionStatuses: (input?: unknown) => Promise<unknown>;
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
};
