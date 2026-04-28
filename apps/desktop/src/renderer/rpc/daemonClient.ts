import type * as Rpc from "./daemonTypes";
import {
  asRecord,
  buildRequest,
  buildUnsupportedMethodError,
  normalizeWorktreePath,
  parseJsonRpcMessage,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
} from "./helpers";

const RPC_REQUEST_TIMEOUT_MS = 30_000;

function createRandomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDesktopWorkspaceId(): string {
  return `desktop-${createRandomId()}`;
}

type PendingRequest = {
  method: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type ActiveSubscription = {
  method: string;
  params?: unknown;
  onNotification: (event: Rpc.DaemonNotification) => void;
};

/** Normalizes daemon file-entry paths so directories always keep a trailing slash. */
function normalizeDaemonFileEntries(files: Rpc.DaemonFileEntry[]): Rpc.DaemonFileEntry[] {
  return files.map((entry) => {
    const trimmedPath = entry.path.replace(/\\/g, "/").replace(/\/+$/, "");
    return {
      ...entry,
      path: entry.isDir ? `${trimmedPath}/` : trimmedPath,
    };
  });
}

export class DaemonClient {
  private readonly openSocket: () => Promise<WebSocket>;
  private socket: WebSocket | null = null;
  private socketOpenPromise: Promise<WebSocket> | null = null;
  private readonly pendingRequestsById = new Map<string, PendingRequest>();
  private readonly subscriptionsById = new Map<string, ActiveSubscription>();
  private readonly workspaceIdByWorktreePath = new Map<string, string>();
  private readonly terminalNextIndexBySessionId = new Map<string, number>();
  private disposed = false;

  constructor(options: { openSocket: () => Promise<WebSocket> }) {
    this.openSocket = options.openSocket;
  }

  readonly workspace = {
    list: this.listWorkspaces.bind(this),
    create: this.createWorkspace.bind(this),
    close: this.closeWorkspace.bind(this),
  };

  readonly file = {
    listFiles: this.listFiles.bind(this),
    listFilesBatch: this.listFilesBatch.bind(this),
    readFile: this.readFile.bind(this),
    writeFile: this.writeFile.bind(this),
    createFile: this.writeFile.bind(this),
    createFolder: this.createFolder.bind(this),
    renameEntry: this.renameEntry.bind(this),
    deleteEntry: this.deleteEntry.bind(this),
    readDiff: this.readFileDiff.bind(this),
  };

  readonly git = {
    inspect: this.inspectGitRepository.bind(this),
    listChanges: this.listGitChanges.bind(this),
    trackChanges: this.trackGitChanges.bind(this),
    unstageChanges: this.unstageGitChanges.bind(this),
    revertChanges: this.revertGitChanges.bind(this),
    commitChanges: this.commitGitChanges.bind(this),
    getBranchStatus: this.getGitBranchStatus.bind(this),
    listCommitsToTarget: this.listGitCommitsToTarget.bind(this),
    readCommitDiff: this.readGitCommitDiff.bind(this),
    readBranchComparisonDiff: this.readGitBranchComparisonDiff.bind(this),
    listBranches: this.listGitBranches.bind(this),
    pushBranch: this.pushGitBranch.bind(this),
    publishBranch: this.publishGitBranch.bind(this),
    renameBranch: this.renameGitBranch.bind(this),
    getAuthorName: this.getGitAuthorName.bind(this),
  };

  readonly terminal = {
    createSession: this.createTerminalSession.bind(this),
    writeInput: this.writeTerminalInput.bind(this),
    resize: this.resizeTerminal.bind(this),
    closeSession: this.closeTerminalSession.bind(this),
    readOutput: this.readTerminalOutput.bind(this),
    listDetectedPorts: this.listDetectedTerminalPorts.bind(this),
    getResourceUsage: this.getTerminalResourceUsage.bind(this),
    listSessions: this.listTerminalSessions.bind(this),
  };

  private clearSocketReference(socket: WebSocket): void {
    if (this.socket === socket) {
      this.socket = null;
    }
  }

  private rejectAllPendingRequests(reason: string): void {
    for (const [requestId, pending] of this.pendingRequestsById.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${reason} while calling method "${pending.method}"`));
      this.pendingRequestsById.delete(requestId);
    }
  }

  private handleSocketMessage(data: unknown): void {
    let message: Rpc.JsonRpcResponse | Rpc.JsonRpcNotification;
    try {
      message = parseJsonRpcMessage(data);
    } catch {
      return;
    }

    if ((message as Rpc.JsonRpcNotification).method) {
      const notification = message as Rpc.JsonRpcNotification;
      this.dispatchNotification({
        method: notification.method,
        payload: notification.params,
      });
      return;
    }

    const response = message as Rpc.JsonRpcResponse;
    const responseId = typeof response.id === "string" ? response.id : "";
    if (!responseId) {
      return;
    }

    const pending = this.pendingRequestsById.get(responseId);
    if (!pending) {
      return;
    }

    this.pendingRequestsById.delete(responseId);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(new Error(`daemon RPC error ${response.error.code}: ${response.error.message}`));
      return;
    }

    pending.resolve(response.result);
  }

  private dispatchNotification(event: Rpc.DaemonNotification): void {
    for (const subscription of this.subscriptionsById.values()) {
      if (!this.matchesSubscription(subscription, event)) {
        continue;
      }

      subscription.onNotification(event);
    }
  }

  private matchesSubscription(subscription: ActiveSubscription, event: Rpc.DaemonNotification): boolean {
    if (subscription.method === "terminal.subscribe") {
      if (event.method !== "terminal.output" && event.method !== "terminal.exit") {
        return false;
      }

      const expectedSessionId = readOptionalString(asRecord(subscription.params)?.sessionId);
      if (!expectedSessionId) {
        return true;
      }

      const payloadSessionId = readOptionalString(asRecord(event.payload)?.sessionId);
      return payloadSessionId === expectedSessionId;
    }

    return event.method === subscription.method;
  }

  private async ensureSocket(): Promise<WebSocket> {
    if (this.disposed) {
      throw new Error("daemon websocket client is disposed");
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return this.socket;
    }

    if (this.socketOpenPromise) {
      return await this.socketOpenPromise;
    }

    this.socketOpenPromise = this.openSocket()
      .then((socket) => {
        this.socket = socket;

        socket.addEventListener("message", (event) => {
          this.handleSocketMessage(event.data);
        });

        socket.addEventListener("close", () => {
          this.clearSocketReference(socket);
          this.rejectAllPendingRequests("daemon websocket closed");
        });

        socket.addEventListener("error", () => {
          this.rejectAllPendingRequests("daemon websocket failed");
        });

        return socket;
      })
      .finally(() => {
        this.socketOpenPromise = null;
      });

    return await this.socketOpenPromise;
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const socket = await this.ensureSocket();
    const request = buildRequest(method, params);

    return await new Promise<unknown>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        if (!this.pendingRequestsById.has(request.id)) {
          return;
        }

        this.pendingRequestsById.delete(request.id);
        rejectPromise(new Error(`daemon RPC request timed out for method "${method}"`));
      }, RPC_REQUEST_TIMEOUT_MS);

      this.pendingRequestsById.set(request.id, {
        method,
        timeout,
        resolve: resolvePromise,
        reject: rejectPromise,
      });

      try {
        socket.send(JSON.stringify(request));
      } catch (error) {
        const pending = this.pendingRequestsById.get(request.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequestsById.delete(request.id);
        }
        rejectPromise(error instanceof Error ? error : new Error(`failed to send daemon RPC method "${method}"`));
      }
    });
  }

  private resolveNamespaceHandler(
    namespace: Rpc.ApiNamespace,
    method: string,
  ): ((input?: unknown) => Promise<unknown>) | null {
    const namespaceNode = (this as Record<string, unknown>)[namespace];
    if (!namespaceNode || typeof namespaceNode !== "object") {
      return null;
    }

    const handler = (namespaceNode as Record<string, unknown>)[method];
    if (typeof handler !== "function") {
      return null;
    }

    return handler as (input?: unknown) => Promise<unknown>;
  }

  private async invoke(method: string, params?: unknown): Promise<unknown> {
    return await this.sendRequest(method, params);
  }

  private async startRawSubscription(options: Rpc.StartSubscriptionOptions): Promise<string> {
    await this.sendRequest(options.method, options.params);
    const subscriptionId = createRandomId();
    this.subscriptionsById.set(subscriptionId, {
      method: options.method,
      params: options.params,
      onNotification: options.onNotification,
    });
    return subscriptionId;
  }

  private async listWorkspaces(): Promise<Rpc.DaemonWorkspace[]> {
    const result = await this.invoke("list");
    if (!Array.isArray(result)) {
      return [];
    }

    const workspaces: Rpc.DaemonWorkspace[] = [];
    for (const candidate of result) {
      const record = asRecord(candidate);
      if (!record) {
        continue;
      }

      const id = readOptionalString(record.id);
      const path = readOptionalString(record.path);
      if (!id || !path) {
        continue;
      }

      workspaces.push({
        id,
        path: normalizeWorktreePath(path),
      });
    }

    return workspaces;
  }

  private async ensureWorkspaceIdByWorktreePath(worktreePath: string): Promise<string> {
    const normalizedWorktreePath = normalizeWorktreePath(worktreePath);
    const cachedWorkspaceId = this.workspaceIdByWorktreePath.get(normalizedWorktreePath);
    if (cachedWorkspaceId) {
      return cachedWorkspaceId;
    }

    const workspaces = await this.listWorkspaces();
    for (const workspace of workspaces) {
      this.workspaceIdByWorktreePath.set(workspace.path, workspace.id);
    }

    const existingWorkspace = workspaces.find((workspace) => workspace.path === normalizedWorktreePath);
    if (existingWorkspace) {
      return existingWorkspace.id;
    }

    const workspaceId = createDesktopWorkspaceId();
    await this.invoke("open", {
      id: workspaceId,
      path: normalizedWorktreePath,
    });
    this.workspaceIdByWorktreePath.set(normalizedWorktreePath, workspaceId);
    return workspaceId;
  }

  private async resolveWorkspaceId(input: unknown): Promise<string> {
    const record = asRecord(input);
    if (!record) {
      throw new Error("workspace input is required");
    }

    const workspaceWorktreePath = readOptionalString(record.workspaceWorktreePath);
    if (workspaceWorktreePath) {
      return await this.ensureWorkspaceIdByWorktreePath(workspaceWorktreePath);
    }

    const cwd = readOptionalString(record.cwd);
    if (cwd) {
      return await this.ensureWorkspaceIdByWorktreePath(cwd);
    }

    const workspaceId = readOptionalString(record.workspaceId);
    if (workspaceId) {
      return workspaceId;
    }

    throw new Error("workspaceId or workspaceWorktreePath is required");
  }

  private async createWorkspace(input: Rpc.WorkspaceCreateInput): Promise<Rpc.WorkspaceCreateResponse> {
    const record = asRecord(input);
    const workspaceWorktreePath = readOptionalString(record?.workspaceWorktreePath);
    if (!workspaceWorktreePath) {
      throw new Error("workspaceWorktreePath is required");
    }

    const workspaceId = createDesktopWorkspaceId();
    const normalizedWorktreePath = normalizeWorktreePath(workspaceWorktreePath);
    await this.invoke("open", {
      id: workspaceId,
      path: normalizedWorktreePath,
    });
    this.workspaceIdByWorktreePath.set(normalizedWorktreePath, workspaceId);

    const sourceBranch = readOptionalString(record?.sourceBranch) || "";
    const targetBranch = readOptionalString(record?.targetBranch) || sourceBranch;
    const worktreePathParts = normalizedWorktreePath.split(/[/\\]/).filter(Boolean);
    const derivedWorkspaceName = worktreePathParts[worktreePathParts.length - 1];
    const workspaceName = readOptionalString(record?.workspaceName) || derivedWorkspaceName || workspaceId;

    return {
      workspace: { id: workspaceId },
      workspaceInstance: {
        workspaceId,
        repoId: readOptionalString(record?.repositoryId) || workspaceId,
        projectId: readOptionalString(record?.repositoryId) || workspaceId,
        name: workspaceName,
        sourceBranch,
        branch: targetBranch,
        worktreePath: normalizedWorktreePath,
        status: "active",
      },
      lifecycleScriptWarnings: [],
    };
  }

  private async closeWorkspace(input: Rpc.WorkspaceCloseExecutionInput): Promise<Rpc.WorkspaceCloseExecutionResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId) || "";
    return {
      workspace: { id: workspaceId, status: "closed" },
      workspaceId,
      lifecycleScriptWarnings: [],
    };
  }

  private async listFiles(input: Rpc.FileListInput): Promise<Rpc.FileListResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath) || "";
    const files = await this.invoke("file.list", { workspaceId, path: relativePath });
    return {
      files: Array.isArray(files)
        ? normalizeDaemonFileEntries(files as Rpc.FileListResponse["files"])
        : [],
    };
  }

  private async listFilesBatch(input: Rpc.FileListBatchInput): Promise<Rpc.FileListBatchResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const requests = Array.isArray(record?.requests) ? record.requests : [];
    const results = await Promise.all(
      requests.map(async (request) => {
        const requestRecord = asRecord(request) ?? {};
        const relativePath = readOptionalString(requestRecord.relativePath) || "";
        try {
          const files = await this.invoke("file.list", { workspaceId, path: relativePath });
          return {
            request: { relativePath, recursive: readOptionalBoolean(requestRecord.recursive) ?? false },
            files: Array.isArray(files)
              ? normalizeDaemonFileEntries(files as Rpc.FileListResponse["files"])
              : [],
          };
        } catch (error) {
          return {
            request: { relativePath, recursive: readOptionalBoolean(requestRecord.recursive) ?? false },
            files: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    return { results };
  }

  private async readFile(input: Rpc.FileReadInput): Promise<Rpc.FileReadResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    const content = await this.invoke("file.read", { workspaceId, path: relativePath });
    return { content: typeof content === "string" ? content : "" };
  }

  private async writeFile(input: Rpc.FileWriteInput): Promise<Rpc.FileWriteResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    const content = typeof record?.content === "string" ? record.content : "";
    const written = await this.invoke("file.write", { workspaceId, path: relativePath, content });
    return { ok: true, written: typeof written === "number" ? written : 0 };
  }

  private async createFolder(input: Rpc.FileCreateFolderInput): Promise<Rpc.FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    await this.invoke("file.mkdir", { workspaceId, path: relativePath, parents: true });
    return { ok: true };
  }

  private async renameEntry(input: Rpc.FileRenameInput): Promise<Rpc.FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const fromRelativePath = readOptionalString(record?.fromRelativePath);
    const toRelativePath = readOptionalString(record?.toRelativePath);
    if (!fromRelativePath || !toRelativePath) {
      throw new Error("fromRelativePath and toRelativePath are required");
    }
    await this.invoke("file.move", { workspaceId, fromPath: fromRelativePath, toPath: toRelativePath });
    return { ok: true };
  }

  private async deleteEntry(input: Rpc.FileDeleteInput): Promise<Rpc.FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    await this.invoke("file.delete", { workspaceId, path: relativePath, recursive: true });
    return { ok: true };
  }

  private async readFileDiff(input: Rpc.FileReadInput): Promise<Rpc.FileDiffResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    const diffText = await this.invoke("file.diff", { workspaceId, path: relativePath });
    return { oldContent: "", newContent: typeof diffText === "string" ? diffText : "" };
  }

  private async listGitChanges(input: Rpc.GitWorktreeInput): Promise<Rpc.GitChangesBySection> {
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.listChanges", { workspaceId })) as Rpc.GitChangesBySection;
  }

  private async inspectGitRepository(input: Rpc.GitInspectInput): Promise<Rpc.GitInspectResponse> {
    const record = asRecord(input);
    const path = readOptionalString(record?.path);
    if (!path) {
      throw new Error("path is required");
    }

    return (await this.invoke("git.inspect", { path })) as Rpc.GitInspectResponse;
  }

  private async trackGitChanges(input: Rpc.GitPathsInput): Promise<Rpc.GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.track", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as Rpc.GitStatusOperationResponse;
  }

  private async unstageGitChanges(input: Rpc.GitPathsInput): Promise<Rpc.GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.unstage", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as Rpc.GitStatusOperationResponse;
  }

  private async revertGitChanges(input: Rpc.GitPathsInput): Promise<Rpc.GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.revert", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as Rpc.GitStatusOperationResponse;
  }

  private async commitGitChanges(input: Rpc.GitCommitInput): Promise<string> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.commit", {
      workspaceId,
      message: readOptionalString(record?.message) || "",
      amend: readOptionalBoolean(record?.amend),
      signoff: readOptionalBoolean(record?.signoff),
    })) as string;
  }

  private async getGitBranchStatus(input: Rpc.GitWorktreeInput): Promise<Rpc.GitBranchStatusResponse> {
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.branchStatus", { workspaceId })) as Rpc.GitBranchStatusResponse;
  }

  private async listGitCommitsToTarget(input: Rpc.GitTargetBranchInput): Promise<Rpc.GitCommitComparisonResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const targetBranch = readOptionalString(record?.targetBranch);
    if (!targetBranch) {
      throw new Error("targetBranch is required");
    }
    return (await this.invoke("git.commitsToTarget", { workspaceId, targetBranch })) as Rpc.GitCommitComparisonResponse;
  }

  private async readGitCommitDiff(input: Rpc.GitCommitDiffInput): Promise<Rpc.GitDiffContentResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const commitHash = readOptionalString(record?.commitHash);
    const relativePath = readOptionalString(record?.relativePath);
    if (!commitHash || !relativePath) {
      throw new Error("commitHash and relativePath are required");
    }
    return (await this.invoke("git.commitDiff", {
      workspaceId,
      commitHash,
      path: relativePath,
    })) as Rpc.GitDiffContentResponse;
  }

  private async readGitBranchComparisonDiff(input: Rpc.GitBranchDiffInput): Promise<Rpc.GitDiffContentResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const targetBranch = readOptionalString(record?.targetBranch);
    const relativePath = readOptionalString(record?.relativePath);
    if (!targetBranch || !relativePath) {
      throw new Error("targetBranch and relativePath are required");
    }
    return (await this.invoke("git.branchDiff", {
      workspaceId,
      targetBranch,
      path: relativePath,
    })) as Rpc.GitDiffContentResponse;
  }

  private async listGitBranches(input: Rpc.GitWorktreeInput): Promise<Rpc.GitBranchListResponse> {
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.branches", { workspaceId })) as Rpc.GitBranchListResponse;
  }

  private async pushGitBranch(input: Rpc.GitWorktreeInput): Promise<string> {
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.push", { workspaceId })) as string;
  }

  private async publishGitBranch(input: Rpc.GitWorktreeInput): Promise<string> {
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.publish", { workspaceId })) as string;
  }

  private async renameGitBranch(input: Rpc.GitRenameBranchInput): Promise<Rpc.GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const nextBranch = readOptionalString(record?.nextBranch);
    if (!nextBranch) {
      throw new Error("nextBranch is required");
    }
    return (await this.invoke("git.renameBranch", { workspaceId, nextBranch })) as Rpc.GitStatusOperationResponse;
  }

  private async getGitAuthorName(input: Rpc.GitWorktreeInput): Promise<string> {
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("git.authorName", { workspaceId })) as string;
  }

  private async createTerminalSession(input: Rpc.TerminalCreateSessionInput): Promise<Rpc.TerminalCreateSessionResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("terminal.start", {
      workspaceId,
      command: readOptionalString(record?.command),
      args: readOptionalStringArray(record?.args),
      env: readOptionalStringArray(record?.env),
    })) as Rpc.TerminalCreateSessionResponse;
  }

  private async writeTerminalInput(input: Rpc.TerminalWriteInput): Promise<Rpc.TerminalMutationOkResponse> {
    const record = asRecord(input);
    const data = typeof record?.data === "string" ? record.data : "";
    await this.invoke("terminal.send", {
      sessionId: readOptionalString(record?.sessionId) || "",
      input: data,
    });
    return { ok: true };
  }

  private async resizeTerminal(input: Rpc.TerminalResizeInput): Promise<Rpc.TerminalMutationOkResponse> {
    const record = asRecord(input);
    await this.invoke("terminal.resize", {
      sessionId: readOptionalString(record?.sessionId) || "",
      cols: Math.max(1, Math.floor(readOptionalNumber(record?.cols) ?? 80)),
      rows: Math.max(1, Math.floor(readOptionalNumber(record?.rows) ?? 24)),
    });
    return { ok: true };
  }

  private async closeTerminalSession(input: Rpc.TerminalCloseInput): Promise<Rpc.TerminalMutationOkResponse> {
    const record = asRecord(input);
    const sessionId = readOptionalString(record?.sessionId) || "";
    await this.invoke("terminal.stop", { sessionId });
    this.terminalNextIndexBySessionId.delete(sessionId);
    return { ok: true };
  }

  private async readTerminalOutput(input: Rpc.TerminalReadOutputInput): Promise<Rpc.TerminalReadOutputResponse> {
    const record = asRecord(input);
    const sessionId = readOptionalString(record?.sessionId) || "";
    const fromIndex = Math.max(0, Math.floor(readOptionalNumber(record?.fromIndex) ?? 0));
    const daemonSnapshot = asRecord(await this.invoke("terminal.read", { sessionId })) ?? {};
    const output = typeof daemonSnapshot.output === "string" ? daemonSnapshot.output : "";
    const running = daemonSnapshot.running === true;
    const chunks = output ? [output] : [];
    const currentIndex = Math.max(this.terminalNextIndexBySessionId.get(sessionId) ?? 0, fromIndex);
    const nextIndex = currentIndex + chunks.length;
    this.terminalNextIndexBySessionId.set(sessionId, nextIndex);
    return { nextIndex, chunks, exited: !running };
  }

  private async listDetectedTerminalPorts(): Promise<Rpc.TerminalDetectedPort[]> {
    return [];
  }

  private async getTerminalResourceUsage(): Promise<Rpc.TerminalResourceUsageSnapshot> {
    return { processes: [] };
  }

  private async listTerminalSessions(_input?: Rpc.TerminalListSessionsInput): Promise<Rpc.TerminalSessionSummary[]> {
    return [];
  }

  async invokeApi(options: {
    namespace: Rpc.ApiNamespace;
    method: string;
    input?: unknown;
  }): Promise<unknown> {
    const handler = this.resolveNamespaceHandler(options.namespace, options.method);
    if (handler) {
      return await handler(options.input);
    }

    return await this.invoke(`${options.namespace}.${options.method}`, options.input);
  }

  async startSubscription(options: Rpc.ProcedureSubscriptionOptions): Promise<string> {
    const path = `${options.namespace}.${options.method}`;
    const record = asRecord(options.input);

    if (options.namespace === "terminal" && options.method === "subscribeOutput") {
      const sessionId = readOptionalString(record?.sessionId) || "";
      return await this.startRawSubscription({
        method: "terminal.subscribe",
        params: { sessionId },
        onNotification: (event) => {
          if (event.method === "terminal.output") {
            const payload = asRecord(event.payload) ?? {};
            const eventSessionId = readOptionalString(payload.sessionId) || sessionId;
            const chunk = typeof payload.chunk === "string" ? payload.chunk : "";
            const nextIndex = (this.terminalNextIndexBySessionId.get(eventSessionId) ?? 0) + 1;
            this.terminalNextIndexBySessionId.set(eventSessionId, nextIndex);
            options.onNotification({
              method: event.method,
              payload: {
                sessionId: eventSessionId,
                chunk,
                nextIndex,
              },
            });
            return;
          }

          options.onNotification({
            method: event.method,
            payload: event.payload,
          });
        },
      });
    }

    if (options.namespace === "terminal" && options.method === "subscribeSessions") {
      const subscriptionId = createRandomId();
      this.subscriptionsById.set(subscriptionId, {
        method: "terminal.sessions",
        onNotification: options.onNotification,
      });
      return subscriptionId;
    }

    if (options.namespace === "terminal" || options.namespace === "git" || options.namespace === "file") {
      return await this.startRawSubscription({
        method: path,
        params: options.input,
        onNotification: options.onNotification,
      });
    }

    throw buildUnsupportedMethodError(path);
  }

  stopSubscription(subscriptionId: string): void {
    if (!this.subscriptionsById.has(subscriptionId)) {
      return;
    }

    this.subscriptionsById.delete(subscriptionId);
  }

  dispose(): void {
    this.disposed = true;
    for (const requestId of this.pendingRequestsById.keys()) {
      const pending = this.pendingRequestsById.get(requestId);
      if (!pending) {
        continue;
      }
      clearTimeout(pending.timeout);
      pending.reject(new Error(`daemon websocket client disposed while calling method "${pending.method}"`));
    }
    this.pendingRequestsById.clear();
    this.subscriptionsById.clear();
    this.socket?.close();
    this.socket = null;
  }
}
