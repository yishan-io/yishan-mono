export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type DaemonState = {
  host: string;
  port: number;
};

export type DaemonNotification = {
  method: string;
  payload: unknown;
};

export type StartSubscriptionOptions = {
  method: string;
  params?: unknown;
  onNotification: (event: DaemonNotification) => void;
};

export type ProcedureNotification = {
  method: string;
  payload: unknown;
};

export type ApiNamespace = "app" | "workspace" | "file" | "git" | "terminal" | "chat" | "agent" | "notification" | "events";

export type ProcedureSubscriptionOptions = {
  namespace: ApiNamespace;
  method: string;
  input?: unknown;
  onNotification: (event: ProcedureNotification) => void;
};

export type DaemonWorkspace = {
  id: string;
  path: string;
};

export type WorkspaceCreateInput = {
  organizationId?: string;
  repoKey?: string;
  sourcePath?: string;
  workspaceName?: string;
  projectId?: string;
  sourceBranch?: string;
  targetBranch?: string;
};

export type WorkspaceCloseExecutionInput = {
  workspaceId: string;
};

export type FileListInput = {
  workspaceWorktreePath: string;
  relativePath?: string;
  recursive?: boolean;
};

export type FileListBatchInput = {
  workspaceWorktreePath: string;
  requests: Array<{
    relativePath?: string;
    recursive?: boolean;
  }>;
};

export type FileReadInput = {
  workspaceWorktreePath: string;
  relativePath: string;
};

export type FileWriteInput = {
  workspaceWorktreePath: string;
  relativePath: string;
  content: string;
};

export type FileCreateFolderInput = {
  workspaceWorktreePath: string;
  relativePath: string;
};

export type FileRenameInput = {
  workspaceWorktreePath: string;
  fromRelativePath: string;
  toRelativePath: string;
};

export type FileDeleteInput = {
  workspaceWorktreePath: string;
  relativePath: string;
};

export type GitWorktreeInput = {
  workspaceWorktreePath: string;
};

export type GitInspectInput = {
  path: string;
};

export type GitPathsInput = {
  workspaceWorktreePath: string;
  relativePaths: string[];
};

export type GitCommitInput = {
  workspaceWorktreePath: string;
  message: string;
  amend?: boolean;
  signoff?: boolean;
};

export type GitTargetBranchInput = {
  workspaceWorktreePath: string;
  targetBranch: string;
};

export type GitCommitDiffInput = {
  workspaceWorktreePath: string;
  commitHash: string;
  relativePath: string;
};

export type GitBranchDiffInput = {
  workspaceWorktreePath: string;
  targetBranch: string;
  relativePath: string;
};

export type GitRenameBranchInput = {
  workspaceWorktreePath: string;
  nextBranch: string;
};

export type TerminalCreateSessionInput = {
  workspaceId?: string;
  workspaceWorktreePath?: string;
  cwd?: string;
  command?: string;
  args?: string[];
  env?: string[];
  cols?: number;
  rows?: number;
  tabId?: string;
  paneId?: string;
};

export type TerminalWriteInput = {
  sessionId: string;
  data: string;
};

export type TerminalResizeInput = {
  sessionId: string;
  cols: number;
  rows: number;
};

export type TerminalCloseInput = {
  sessionId: string;
};

export type TerminalReadOutputInput = {
  sessionId: string;
  fromIndex: number;
};

export type TerminalListSessionsInput = {
  includeExited?: boolean;
};

export type WorkspaceListResponse = DaemonWorkspace[];

export type WorkspaceCreateResponse = {
  workspaceId: string;
  projectId: string;
  name: string;
  sourceBranch: string;
  branch: string;
  worktreePath: string;
  status: string;
  lifecycleScriptWarnings: unknown[];
};

export type WorkspaceCloseExecutionResponse = {
  workspace: { id: string; status: string };
  workspaceId: string;
  lifecycleScriptWarnings: unknown[];
};

export type DaemonFileEntry = {
  path: string;
  name: string;
  isDir: boolean;
  isIgnored?: boolean;
  size: number;
  mode: number;
};

export type FileListResponse = {
  files: DaemonFileEntry[];
};

export type FileListBatchResponse = {
  results: Array<{
    request: {
      relativePath: string;
      recursive: boolean;
    };
    files: DaemonFileEntry[];
    error?: string;
  }>;
};

export type FileReadResponse = {
  content: string;
};

export type FileWriteResponse = {
  ok: true;
  written: number;
};

export type FileMutationOkResponse = {
  ok: true;
};

export type FileDiffResponse = {
  oldContent: string;
  newContent: string;
};

export type GitChange = {
  path: string;
  kind: string;
  additions: number;
  deletions: number;
};

export type GitChangesBySection = {
  unstaged: GitChange[];
  staged: GitChange[];
  untracked: GitChange[];
};

export type GitStatusOperationResponse = {
  tracked?: boolean;
  unstaged?: boolean;
  reverted?: boolean;
  renamed?: boolean;
};

export type GitInspectResponse = {
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
};

export type GitBranchStatusResponse = {
  hasUpstream: boolean;
  aheadCount: number;
};

export type GitCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  committedAt: string;
  subject: string;
  changedFiles: string[];
};

export type GitCommitComparisonResponse = {
  currentBranch: string;
  targetBranch: string;
  allChangedFiles: string[];
  commits: GitCommit[];
};

export type GitDiffContentResponse = {
  oldContent: string;
  newContent: string;
};

export type GitBranchListResponse = {
  currentBranch: string;
  branches: string[];
};

export type TerminalCreateSessionResponse = {
  sessionId: string;
};

export type TerminalMutationOkResponse = {
  ok: true;
};

export type TerminalReadOutputResponse = {
  nextIndex: number;
  chunks: string[];
  exited: boolean;
};

export type TerminalStreamEvent =
  | {
      type: "output";
      sessionId: string;
      chunk: string;
      nextIndex: number;
    }
  | {
      type: "exit";
      sessionId: string;
      exitCode?: number;
    };

export type TerminalDetectedPort = {
  sessionId: string;
  workspaceId: string;
  pid: number;
  port: number;
  address: string;
  processName: string;
};

export type TerminalResourceUsageSnapshot = {
  processes: Array<{
    sessionId: string;
    workspaceId: string;
    pid: number;
    processName: string;
    cpuPercent: number;
    memoryBytes: number;
  }>;
};

export type TerminalSessionSummary = {
  sessionId: string;
  workspaceId: string;
  pid: number;
  status: "running" | "exited";
  startedAt?: string;
  exitedAt?: string;
};

export type TerminalSessionLifecycleEvent = {
  type: "session.started" | "session.exited" | "session.updated";
  session: TerminalSessionSummary;
};
