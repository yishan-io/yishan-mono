import { generateId } from "../helpers/generateId";
import { DaemonFileClient } from "./daemonFileClient";
import { DaemonGitClient } from "./daemonGitClient";
import { DaemonTerminalClient } from "./daemonTerminalClient";
import type * as Rpc from "./daemonTypes";
import { DaemonWorkspaceClient } from "./daemonWorkspaceClient";
import {
  asRecord,
  buildRequest,
  buildUnsupportedMethodError,
  parseJsonRpcMessage,
  readOptionalString,
} from "./helpers";

const RPC_REQUEST_TIMEOUT_MS = 30_000;
// workspace.create can take a very long time for large repos (shallow fetch +
// worktree checkout + setup script). Allow up to 40 minutes before giving up.
const WORKSPACE_CREATE_TIMEOUT_MS = 40 * 60 * 1_000;
const terminalFrameTextEncoder = new TextEncoder();
const terminalFrameTextDecoder = new TextDecoder();

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
  registeredWithDaemon: boolean;
};

type DaemonRpcError = Error & { code?: number };

type DaemonClientConnectionEvent = "connecting" | "connected" | "disconnected";

function createDaemonRpcError(code: number, message: string): DaemonRpcError {
  const error = new Error(message || `daemon RPC error ${code}`) as DaemonRpcError;
  error.code = code;
  return error;
}

export class DaemonClient {
  private readonly openSocket: () => Promise<WebSocket>;
  private readonly onConnectionEvent?: (event: DaemonClientConnectionEvent) => void;
  private socket: WebSocket | null = null;
  private socketOpenPromise: Promise<WebSocket> | null = null;
  private readonly pendingRequestsById = new Map<string, PendingRequest>();
  private readonly subscriptionsById = new Map<string, ActiveSubscription>();
  private readonly workspaceIdByWorktreePath = new Map<string, string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectPromise: Promise<void> | null = null;
  private disposed = false;

  private readonly _workspaceClient: DaemonWorkspaceClient;
  private readonly _fileClient: DaemonFileClient;
  private readonly _gitClient: DaemonGitClient;
  private readonly _terminalClient: DaemonTerminalClient;

  constructor(options: {
    openSocket: () => Promise<WebSocket>;
    onConnectionEvent?: (event: DaemonClientConnectionEvent) => void;
  }) {
    this.openSocket = options.openSocket;
    this.onConnectionEvent = options.onConnectionEvent;

    const invoke = this.invoke.bind(this);
    const resolveWorkspaceId = this.resolveWorkspaceId.bind(this);

    this._workspaceClient = new DaemonWorkspaceClient(invoke, this.workspaceIdByWorktreePath);
    this._fileClient = new DaemonFileClient(invoke);
    this._gitClient = new DaemonGitClient(invoke);
    this._terminalClient = new DaemonTerminalClient({
      invoke,
      resolveWorkspaceId,
      sendBinary: this.sendTerminalInputBinary.bind(this),
      getSocketReadyState: () => this.socket?.readyState ?? null,
      subscriptionsById: this.subscriptionsById as DaemonTerminalClient["subscriptionsById"],
    });
  }

  readonly workspace = {
    list: () => this._workspaceClient.list(),
    refreshPullRequest: (input: Rpc.WorkspaceRefreshPullRequestInput) =>
      this._workspaceClient.refreshPullRequest(input),
    createWorkspace: (input: Rpc.WorkspaceCreateInput) => this._workspaceClient.createWorkspace(input),
    close: (input: Rpc.WorkspaceCloseExecutionInput) => this._workspaceClient.close(input),
    syncContextLink: (input: Rpc.WorkspaceSyncContextLinkInput) => this._workspaceClient.syncContextLink(input),
    health: (input: Rpc.WorkspaceHealthInput) => this._workspaceClient.health(input),
    repair: (input: Rpc.WorkspaceRepairInput) => this._workspaceClient.repair(input),
    forget: (input: Rpc.WorkspaceForgetInput) => this._workspaceClient.forget(input),
    openProject: (input: Rpc.WorkspaceOpenProjectInput) => this._workspaceClient.openProject(input),
    closeProject: (input: Rpc.WorkspaceCloseProjectInput) => this._workspaceClient.closeProject(input),
  };

  readonly file = {
    listFiles: (input: Rpc.FileListInput) => this._fileClient.listFiles(input),
    listFilesBatch: (input: Rpc.FileListBatchInput) => this._fileClient.listFilesBatch(input),
    searchFiles: (input: Rpc.FileSearchInput) => this._fileClient.searchFiles(input),
    readFile: (input: Rpc.FileReadInput) => this._fileClient.readFile(input),
    writeFile: (input: Rpc.FileWriteInput) => this._fileClient.writeFile(input),
    createFile: (input: Rpc.FileWriteInput) => this._fileClient.writeFile(input),
    createFolder: (input: Rpc.FileCreateFolderInput) => this._fileClient.createFolder(input),
    renameEntry: (input: Rpc.FileRenameInput) => this._fileClient.renameEntry(input),
    deleteEntry: (input: Rpc.FileDeleteInput) => this._fileClient.deleteEntry(input),
    readDiff: (input: Rpc.FileReadInput) => this._fileClient.readDiff(input),
  };

  readonly git = {
    inspect: (input: Rpc.GitInspectInput) => this._gitClient.inspect(input),
    inspectPath: (input: Rpc.GitInspectPathInput) => this._gitClient.inspectPath(input),
    listChanges: (input: Rpc.GitWorktreeInput) => this._gitClient.listChanges(input),
    trackChanges: (input: Rpc.GitPathsInput) => this._gitClient.trackChanges(input),
    unstageChanges: (input: Rpc.GitPathsInput) => this._gitClient.unstageChanges(input),
    revertChanges: (input: Rpc.GitPathsInput) => this._gitClient.revertChanges(input),
    commitChanges: (input: Rpc.GitCommitInput) => this._gitClient.commitChanges(input),
    getBranchStatus: (input: Rpc.GitWorktreeInput) => this._gitClient.getBranchStatus(input),
    listCommitsToTarget: (input: Rpc.GitTargetBranchInput) => this._gitClient.listCommitsToTarget(input),
    getBranchDiffSummary: (input: Rpc.GitTargetBranchInput) => this._gitClient.getBranchDiffSummary(input),
    readCommitDiff: (input: Rpc.GitCommitDiffInput) => this._gitClient.readCommitDiff(input),
    readBranchComparisonDiff: (input: Rpc.GitBranchDiffInput) => this._gitClient.readBranchComparisonDiff(input),
    listBranches: (input: Rpc.GitWorktreeInput) => this._gitClient.listBranches(input),
    pushBranch: (input: Rpc.GitWorktreeInput) => this._gitClient.pushBranch(input),
    publishBranch: (input: Rpc.GitWorktreeInput) => this._gitClient.publishBranch(input),
    renameBranch: (input: Rpc.GitRenameBranchInput) => this._gitClient.renameBranch(input),
    getAuthorName: (input: Rpc.GitWorktreeInput) => this._gitClient.getAuthorName(input),
    mergePullRequest: (input: Rpc.GitPrMergeInput) => this._gitClient.mergePullRequest(input),
    closePullRequest: (input: Rpc.GitPrCloseInput) => this._gitClient.closePullRequest(input),
  };

  readonly terminal = {
    createSession: (input: Rpc.TerminalCreateSessionInput) => this._terminalClient.createSession(input),
    writeInput: (input: Rpc.TerminalWriteInput) => this._terminalClient.writeInput(input),
    resize: (input: Rpc.TerminalResizeInput) => this._terminalClient.resize(input),
    closeSession: (input: Rpc.TerminalCloseInput) => this._terminalClient.closeSession(input),
    killProcess: (input: Rpc.TerminalKillProcessInput) => this._terminalClient.killProcess(input),
    readOutput: (input: Rpc.TerminalReadOutputInput) => this._terminalClient.readOutput(input),
    listDetectedPorts: () => this._terminalClient.listDetectedPorts(),
    setActiveWorkspace: (input: Rpc.SetActiveWorkspaceInput) => this._terminalClient.setActiveWorkspace(input),
    getResourceUsage: () => this._terminalClient.getResourceUsage(),
    listSessions: (input?: Rpc.TerminalListSessionsInput) => this._terminalClient.listSessions(input),
  };

  readonly context = {
    getState: () => this.sendRequest("context.getState"),
    setCurrentOrg: (orgId: string) => this.sendRequest("context.setCurrentOrg", { orgId }),
    setActiveProject: (projectId: string) => this.sendRequest("context.setActiveProject", { projectId }),
    setActiveFile: (filePath: string) => this.sendRequest("context.setActiveFile", { filePath }),
  };

  // ─── Connection Lifecycle ───────────────────────────────────────────────────

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

  private async restoreDaemonSubscriptions(): Promise<void> {
    const activeSubscriptions = Array.from(this.subscriptionsById.values()).filter(
      (subscription) => subscription.registeredWithDaemon,
    );
    for (const subscription of activeSubscriptions) {
      try {
        await this.sendRequest(subscription.method, subscription.params);
      } catch {
        // A later reconnect attempt will re-register subscriptions again.
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectPromise || this.socketOpenPromise) {
      return;
    }

    this.reconnectPromise = this.ensureSocket()
      .then(() => undefined)
      .catch(() => {
        if (!this.disposed && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.scheduleReconnect();
          }, 1_000);
        }
      })
      .finally(() => {
        this.reconnectPromise = null;
      });
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
      pending.reject(createDaemonRpcError(response.error.code, response.error.message));
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

    if (subscription.method === "events.frontendStream" && event.method === "events.frontendStream") {
      return true;
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

    this.onConnectionEvent?.("connecting");
    this.socketOpenPromise = this.openSocket()
      .then((socket) => {
        this.socket = socket;
        this.onConnectionEvent?.("connected");
        // Enable binary frame reception as ArrayBuffer for terminal output fast-path.
        socket.binaryType = "arraybuffer";

        socket.addEventListener("message", (event) => {
          // Binary frames are terminal output — route directly to subscriber.
          if (event.data instanceof ArrayBuffer) {
            this.handleBinaryFrame(event.data);
            return;
          }
          this.handleSocketMessage(event.data);
        });

        socket.addEventListener("close", () => {
          this.clearSocketReference(socket);
          this.rejectAllPendingRequests("daemon websocket closed");
          this.onConnectionEvent?.("disconnected");
          this.scheduleReconnect();
        });

        socket.addEventListener("error", () => {
          this.rejectAllPendingRequests("daemon websocket failed");
          this.onConnectionEvent?.("disconnected");
          this.scheduleReconnect();
        });

        // Clear stale workspace ID cache so that the next workspace-scoped
        // operation re-registers workspaces with the new daemon instance (which
        // also re-establishes filesystem watchers on the daemon side).
        this.workspaceIdByWorktreePath.clear();

        void this.restoreDaemonSubscriptions();

        return socket;
      })
      .catch((error) => {
        this.onConnectionEvent?.("disconnected");
        throw error;
      })
      .finally(() => {
        this.socketOpenPromise = null;
      });

    return await this.socketOpenPromise;
  }

  private async sendRequest(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    const socket = await this.ensureSocket();
    const request = buildRequest(method, params);
    const requestTimeoutMs = timeoutMs ?? RPC_REQUEST_TIMEOUT_MS;

    return await new Promise<unknown>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        if (!this.pendingRequestsById.has(request.id)) {
          return;
        }

        this.pendingRequestsById.delete(request.id);
        rejectPromise(new Error(`daemon RPC request timed out for method "${method}"`));
      }, requestTimeoutMs);

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

  /**
   * Sends terminal input as a binary WebSocket frame, bypassing JSON
   * serialization entirely. Frame format: [0x01] [sessionId + '\0'] [input bytes]
   */
  private sendTerminalInputBinary(sessionId: string, data: string | Uint8Array): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const sessionIdBytes = terminalFrameTextEncoder.encode(sessionId);
      const inputBytes = typeof data === "string" ? terminalFrameTextEncoder.encode(data) : data;
      const frame = new Uint8Array(1 + sessionIdBytes.length + 1 + inputBytes.length);
      frame[0] = 0x01; // opcode: terminal input
      frame.set(sessionIdBytes, 1);
      frame[1 + sessionIdBytes.length] = 0; // null terminator
      frame.set(inputBytes, 1 + sessionIdBytes.length + 1);
      socket.send(frame);
    } catch {
      // Best-effort: silently drop if socket is in a bad state.
    }
  }

  /**
   * Handles an incoming binary WebSocket frame (terminal output fast-path).
   * Frame format: [0x02] [sessionId + '\0'] [raw PTY bytes]
   */
  private handleBinaryFrame(buffer: ArrayBuffer): void {
    const data = new Uint8Array(buffer);
    if (data.length < 3) {
      return;
    }

    const opcode = data[0];
    if (opcode !== 0x02) {
      return; // Only terminal output is expected as binary.
    }

    // Find null terminator after session ID.
    let nullIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i] === 0) {
        nullIdx = i;
        break;
      }
    }
    if (nullIdx < 0) {
      return;
    }

    const sessionId = terminalFrameTextDecoder.decode(data.subarray(1, nullIdx));
    const chunk = data.subarray(nullIdx + 1);
    if (chunk.length === 0) {
      return;
    }

    // Dispatch as a terminal output event to matching subscribers.
    for (const subscription of this.subscriptionsById.values()) {
      if (subscription.method !== "terminal.subscribe") {
        continue;
      }
      const expectedSessionId = readOptionalString(asRecord(subscription.params)?.sessionId);
      if (expectedSessionId && expectedSessionId !== sessionId) {
        continue;
      }
      subscription.onNotification({
        method: "terminal.output",
        payload: { sessionId, chunk },
      });
    }
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

  private async invoke(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    return await this.sendRequest(method, params, timeoutMs);
  }

  private resolveWorkspaceId(input: unknown): Promise<string> {
    return this._workspaceClient.resolveId(input);
  }

  private async startRawSubscription(options: Rpc.StartSubscriptionOptions): Promise<string> {
    await this.sendRequest(options.method, options.params);
    const subscriptionId = generateId();
    this.subscriptionsById.set(subscriptionId, {
      method: options.method,
      params: options.params,
      onNotification: options.onNotification,
      registeredWithDaemon: true,
    });
    return subscriptionId;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

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
            // Accept both string (JSON-RPC) and Uint8Array (binary fast-path) chunks.
            const rawChunk = payload.chunk;
            const chunk = rawChunk instanceof Uint8Array ? rawChunk : typeof rawChunk === "string" ? rawChunk : "";
            const terminalNextIndexBySessionId = this._terminalClient.terminalNextIndexBySessionId;
            const nextIndex = (terminalNextIndexBySessionId.get(eventSessionId) ?? 0) + 1;
            terminalNextIndexBySessionId.set(eventSessionId, nextIndex);
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
      const subscriptionId = generateId();
      this.subscriptionsById.set(subscriptionId, {
        method: "terminal.sessions",
        onNotification: options.onNotification,
        registeredWithDaemon: false,
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

    if (options.namespace === "events" && options.method === "frontendStream") {
      return await this.startRawSubscription({
        method: path,
        params: options.input,
        onNotification: (event) => {
          const payload = asRecord(event.payload);
          const result = asRecord(payload?.result);
          options.onNotification({
            method: event.method,
            payload: result ?? payload ?? event.payload,
          });
        },
      });
    }

    throw buildUnsupportedMethodError(path);
  }

  stopSubscription(subscriptionId: string): void {
    const subscription = this.subscriptionsById.get(subscriptionId);
    if (!subscription) {
      return;
    }

    this.subscriptionsById.delete(subscriptionId);
    if (subscription.method !== "terminal.subscribe") {
      return;
    }

    const sessionId = readOptionalString(asRecord(subscription.params)?.sessionId);
    if (!sessionId) {
      return;
    }

    if (!this._terminalClient.hasSubscriptionForSession(sessionId)) {
      this._terminalClient.terminalNextIndexBySessionId.delete(sessionId);
    }
    if (subscription.registeredWithDaemon) {
      void this.sendRequest("terminal.unsubscribe", { sessionId }).catch(() => undefined);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
