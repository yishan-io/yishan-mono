import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type * as Rpc from "./jsonRpcTypes";
import {
  asRecord,
  buildRequest,
  buildUnsupportedMethodError,
  normalizeWorktreePath,
  openSocket,
  parseJsonRpcMessage,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
} from "./jsonRpcHelpers";

const RPC_REQUEST_TIMEOUT_MS = 30_000;

export class DaemonJsonRpcClient {
  private readonly subscriptionSockets = new Map<string, WebSocket | null>();
  private readonly workspaceIdByWorktreePath = new Map<string, string>();
  private readonly terminalNextIndexBySessionId = new Map<string, number>();

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
    const socket = await openSocket();

    return await new Promise<unknown>((resolvePromise, rejectPromise) => {
      const request = buildRequest(method, params);
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.close();
        rejectPromise(new Error(`daemon RPC request timed out for method \"${method}\"`));
      }, RPC_REQUEST_TIMEOUT_MS);

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      socket.addEventListener("message", (event) => {
        let message: Rpc.JsonRpcResponse | Rpc.JsonRpcNotification;
        try {
          message = parseJsonRpcMessage(event.data);
        } catch (error) {
          settle(() => {
            socket.close();
            rejectPromise(error instanceof Error ? error : new Error("failed to parse daemon websocket payload"));
          });
          return;
        }

        if ((message as Rpc.JsonRpcResponse).id !== request.id) {
          return;
        }

        const response = message as Rpc.JsonRpcResponse;
        if (response.error) {
          const rpcError = response.error;
          settle(() => {
            socket.close();
            rejectPromise(new Error(`daemon RPC error ${rpcError.code}: ${rpcError.message}`));
          });
          return;
        }

        settle(() => {
          socket.close();
          resolvePromise(response.result);
        });
      });

      socket.addEventListener("close", () => {
        settle(() => {
          rejectPromise(new Error(`daemon websocket closed while waiting for method \"${method}\"`));
        });
      });

      socket.addEventListener("error", () => {
        settle(() => {
          rejectPromise(new Error(`daemon websocket failed while calling method \"${method}\"`));
        });
      });

      socket.send(JSON.stringify(request));
    });
  }

  private async startRawSubscription(options: Rpc.StartSubscriptionOptions): Promise<string> {
    const socket = await openSocket();
    const request = buildRequest(options.method, options.params);
    const subscriptionId = randomUUID();

    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.close();
        rejectPromise(new Error(`daemon subscription timed out for method \"${options.method}\"`));
      }, RPC_REQUEST_TIMEOUT_MS);

      const resolveOnce = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolvePromise();
      };

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        rejectPromise(error);
      };

      socket.addEventListener("message", (event) => {
        let message: Rpc.JsonRpcResponse | Rpc.JsonRpcNotification;
        try {
          message = parseJsonRpcMessage(event.data);
        } catch (error) {
          socket.close();
          rejectOnce(error instanceof Error ? error : new Error("failed to parse daemon websocket payload"));
          return;
        }

        if ((message as Rpc.JsonRpcNotification).method) {
          const notification = message as Rpc.JsonRpcNotification;
          options.onNotification({
            method: notification.method,
            payload: notification.params,
          });
          return;
        }

        const response = message as Rpc.JsonRpcResponse;
        if (response.id !== request.id) {
          return;
        }

        if (response.error) {
          const rpcError = response.error;
          socket.close();
          rejectOnce(new Error(`daemon RPC error ${rpcError.code}: ${rpcError.message}`));
          return;
        }

        resolveOnce();
      });

      socket.addEventListener("close", () => {
        if (!settled) {
          rejectOnce(new Error(`daemon websocket closed while subscribing to method \"${options.method}\"`));
          return;
        }

        this.subscriptionSockets.delete(subscriptionId);
      });

      socket.addEventListener("error", () => {
        if (!this.subscriptionSockets.has(subscriptionId)) {
          rejectOnce(new Error(`daemon websocket failed while subscribing to method \"${options.method}\"`));
        }
      });

      socket.send(JSON.stringify(request));
    });

    this.subscriptionSockets.set(subscriptionId, socket);
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

    const workspaceId = `desktop-${randomUUID()}`;
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

  private toTerminalCreateCommand(input: unknown): { command: string; args?: string[]; env?: string[] } {
    const record = asRecord(input) ?? {};
    const explicitCommand = readOptionalString(record.command);
    const args = readOptionalStringArray(record.args);
    const env = readOptionalStringArray(record.env);

    if (explicitCommand) {
      return {
        command: explicitCommand,
        args,
        env,
      };
    }

    if (process.platform === "win32") {
      return {
        command: "cmd.exe",
      };
    }

    return {
      command: process.env.SHELL?.trim() || "/bin/bash",
      args: ["-l"],
    };
  }

  private async createWorkspace(input: Rpc.WorkspaceCreateInput): Promise<Rpc.WorkspaceCreateResponse> {
    const record = asRecord(input);
    const workspaceWorktreePath = readOptionalString(record?.workspaceWorktreePath);
    if (!workspaceWorktreePath) {
      throw new Error("workspaceWorktreePath is required");
    }

    const workspaceId = `desktop-${randomUUID()}`;
    const normalizedWorktreePath = normalizeWorktreePath(workspaceWorktreePath);
    await this.invoke("open", {
      id: workspaceId,
      path: normalizedWorktreePath,
    });
    this.workspaceIdByWorktreePath.set(normalizedWorktreePath, workspaceId);

    const sourceBranch = readOptionalString(record?.sourceBranch) || "";
    const targetBranch = readOptionalString(record?.targetBranch) || sourceBranch;
    const workspaceName = readOptionalString(record?.workspaceName) || basename(normalizedWorktreePath) || workspaceId;

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
    return { files: Array.isArray(files) ? (files as Rpc.FileListResponse["files"]) : [] };
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
            files: Array.isArray(files) ? (files as Rpc.FileListResponse["files"]) : [],
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
    const workspaceId = await this.resolveWorkspaceId(input);
    const { command, args, env } = this.toTerminalCreateCommand(input);
    return (await this.invoke("terminal.start", { workspaceId, command, args, env })) as Rpc.TerminalCreateSessionResponse;
  }

  private async writeTerminalInput(input: Rpc.TerminalWriteInput): Promise<Rpc.TerminalMutationOkResponse> {
    const record = asRecord(input);
    await this.invoke("terminal.send", {
      sessionId: readOptionalString(record?.sessionId) || "",
      input: readOptionalString(record?.data) || "",
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
    if (!handler) {
      throw buildUnsupportedMethodError(`${options.namespace}.${options.method}`);
    }

    return await handler(options.input);
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
      const subscriptionId = randomUUID();
      this.subscriptionSockets.set(subscriptionId, null);
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
    const socket = this.subscriptionSockets.get(subscriptionId);
    if (socket === undefined) {
      return;
    }

    this.subscriptionSockets.delete(subscriptionId);
    socket?.close();
  }

  dispose(): void {
    for (const subscriptionId of this.subscriptionSockets.keys()) {
      this.stopSubscription(subscriptionId);
    }
  }
}
