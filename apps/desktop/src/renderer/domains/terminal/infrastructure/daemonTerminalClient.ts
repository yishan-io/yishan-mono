import { resolveWorkspaceId as resolveWorkspaceIdCommand } from "@renderer/domains/workspace";
import { generateId } from "../../../helpers/generateId";
import type { DaemonNotification } from "../../../rpc/daemonTypes";
import { asRecord, readOptionalNumber, readOptionalString, readOptionalStringArray } from "../../../rpc/helpers";
import { getDaemonTransport } from "../../../rpc/rpcTransport";

export type TerminalCreateSessionInput = {
  workspaceId: string;
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
  data: string | Uint8Array;
};

export type TerminalResizeInput = {
  sessionId: string;
  cols: number;
  rows: number;
};

export type TerminalCloseInput = {
  sessionId: string;
};

export type TerminalKillProcessInput = {
  pid: number;
};

export type TerminalReadOutputInput = {
  sessionId: string;
  fromIndex: number;
};

export type TerminalListSessionsInput = {
  includeExited?: boolean;
};

export type SetActiveWorkspaceInput = {
  workspaceId?: string;
};

export type TerminalCreateSessionResponse = {
  sessionId: string;
};

export type TerminalMutationOkResponse = {
  ok: true;
};

export type SetActiveWorkspaceResponse = {
  updated: boolean;
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
      chunk: string | Uint8Array;
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

/**
 * Terminal wire DTOs (desktop7 Phase 25). Owned by the Terminal Domain
 * Infrastructure; the daemon payload shapes are the transport contract.
 */

type InvokeFn = (method: string, params?: unknown) => Promise<unknown>;
type SendBinaryFn = (sessionId: string, data: string | Uint8Array) => void;
type ResolveWorkspaceIdFn = (input: {
  workspaceId?: string;
  workspaceWorktreePath?: string;
  cwd?: string;
}) => Promise<string>;

const terminalFrameTextDecoder = new TextDecoder();

/** Terminal namespace methods for the daemon RPC client. */
export class DaemonTerminalClient {
  private readonly invoke: InvokeFn;
  private readonly resolveWorkspaceId: ResolveWorkspaceIdFn;
  private readonly sendBinary: SendBinaryFn;
  private readonly getSocketReadyState: () => number | null;
  private readonly startRawSubscription: (options: {
    method: string;
    params?: unknown;
    onNotification: (event: DaemonNotification) => void;
  }) => Promise<string>;

  readonly subscriptionsById: Map<
    string,
    {
      method: string;
      params?: unknown;
      onNotification: (event: DaemonNotification) => void;
      registeredWithDaemon: boolean;
    }
  >;

  readonly terminalNextIndexBySessionId: Map<string, number>;

  constructor(options: {
    invoke: InvokeFn;
    resolveWorkspaceId: ResolveWorkspaceIdFn;
    sendBinary: SendBinaryFn;
    getSocketReadyState: () => number | null;
    subscriptionsById: DaemonTerminalClient["subscriptionsById"];
    terminalNextIndexBySessionId: Map<string, number>;
    startRawSubscription: DaemonTerminalClient["startRawSubscription"];
  }) {
    this.invoke = options.invoke;
    this.resolveWorkspaceId = options.resolveWorkspaceId;
    this.sendBinary = options.sendBinary;
    this.getSocketReadyState = options.getSocketReadyState;
    this.subscriptionsById = options.subscriptionsById;
    this.terminalNextIndexBySessionId = options.terminalNextIndexBySessionId;
    this.startRawSubscription = options.startRawSubscription;
  }

  async createSession(input: TerminalCreateSessionInput): Promise<TerminalCreateSessionResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("terminal.start", {
      workspaceId,
      command: readOptionalString(record?.command),
      args: readOptionalStringArray(record?.args),
      env: readOptionalStringArray(record?.env),
      tabId: readOptionalString(record?.tabId),
      paneId: readOptionalString(record?.paneId),
    })) as TerminalCreateSessionResponse;
  }

  async writeInput(input: TerminalWriteInput): Promise<TerminalMutationOkResponse> {
    const record = asRecord(input);
    const rawData = record?.data;
    const data = rawData instanceof Uint8Array ? rawData : typeof rawData === "string" ? rawData : "";
    const sessionId = readOptionalString(record?.sessionId) || "";

    // Fast path: send as binary WebSocket frame — zero JSON overhead.
    const readyState = this.getSocketReadyState();
    if (readyState === WebSocket.OPEN) {
      this.sendBinary(sessionId, data);
      return { ok: true };
    }

    // Fallback: socket is not open yet (rare — e.g. reconnection in progress).
    await this.invoke("terminal.send", {
      sessionId,
      input: typeof data === "string" ? data : terminalFrameTextDecoder.decode(data),
    });
    return { ok: true };
  }

  async resize(input: TerminalResizeInput): Promise<TerminalMutationOkResponse> {
    const record = asRecord(input);
    await this.invoke("terminal.resize", {
      sessionId: readOptionalString(record?.sessionId) || "",
      cols: Math.max(1, Math.floor(readOptionalNumber(record?.cols) ?? 80)),
      rows: Math.max(1, Math.floor(readOptionalNumber(record?.rows) ?? 24)),
    });
    return { ok: true };
  }

  async closeSession(input: TerminalCloseInput): Promise<TerminalMutationOkResponse> {
    const record = asRecord(input);
    const sessionId = readOptionalString(record?.sessionId) || "";
    await this.invoke("terminal.stop", { sessionId });
    this.dropSubscriptionsForSession(sessionId);
    this.terminalNextIndexBySessionId.delete(sessionId);
    return { ok: true };
  }

  async killProcess(input: TerminalKillProcessInput): Promise<TerminalMutationOkResponse> {
    const record = asRecord(input);
    const pid = Math.floor(readOptionalNumber(record?.pid) ?? 0);
    await this.invoke("terminal.killProcess", { pid });
    return { ok: true };
  }

  async readOutput(input: TerminalReadOutputInput): Promise<TerminalReadOutputResponse> {
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

  async listDetectedPorts(): Promise<TerminalDetectedPort[]> {
    const ports = await this.invoke("terminal.listDetectedPorts", {});
    if (!Array.isArray(ports)) {
      return [];
    }
    return ports.flatMap((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return [];
      }
      const sessionId = readOptionalString(record.sessionId);
      const workspaceId = readOptionalString(record.workspaceId);
      const pid = readOptionalNumber(record.pid);
      const port = readOptionalNumber(record.port);
      if (!sessionId || !workspaceId || pid === undefined || port === undefined) {
        return [];
      }
      return [
        {
          sessionId,
          workspaceId,
          pid,
          port,
          address: readOptionalString(record.address) || readOptionalString(record.host) || "0.0.0.0",
          processName: readOptionalString(record.processName) || "unknown",
        },
      ];
    });
  }

  async setActiveWorkspace(input: SetActiveWorkspaceInput): Promise<SetActiveWorkspaceResponse> {
    const record = asRecord(input);
    return (await this.invoke("workspace.setActive", {
      workspaceId: readOptionalString(record?.workspaceId),
    })) as SetActiveWorkspaceResponse;
  }

  async getResourceUsage(): Promise<TerminalResourceUsageSnapshot> {
    return { processes: [] };
  }

  async listSessions(input?: TerminalListSessionsInput): Promise<TerminalSessionSummary[]> {
    return (await this.invoke("terminal.listSessions", input ?? {})) as TerminalSessionSummary[];
  }

  /** Subscribes one listener to live output/exit frames for one session. */
  subscribeOutput(
    input: { sessionId: string },
    handlers: { onData: (event: unknown) => void; onError?: (error: unknown) => void },
  ): Promise<{ unsubscribe: () => void }> {
    const sessionId = input.sessionId || "";
    return this.startRawSubscription({
      method: "terminal.subscribe",
      params: { sessionId },
      onNotification: (event) => {
        if (event.method === "terminal.output") {
          const payload = asRecord(event.payload) ?? {};
          const eventSessionId = readOptionalString(payload.sessionId) || sessionId;
          const rawChunk = payload.chunk;
          const chunk = rawChunk instanceof Uint8Array ? rawChunk : typeof rawChunk === "string" ? rawChunk : "";
          const nextIndex = (this.terminalNextIndexBySessionId.get(eventSessionId) ?? 0) + 1;
          this.terminalNextIndexBySessionId.set(eventSessionId, nextIndex);
          handlers.onData({ sessionId: eventSessionId, chunk, nextIndex });
          return;
        }
        handlers.onData(event);
      },
    }).then((subscriptionId) => ({
      unsubscribe: () => this.teardownTerminalSubscription(subscriptionId, sessionId),
    }));
  }

  /** Subscribes one listener to global terminal session lifecycle updates. */
  subscribeSessions(
    _input: undefined,
    handlers: { onData: (event: unknown) => void; onError?: (error: unknown) => void },
  ): Promise<{ unsubscribe: () => void }> {
    const subscriptionId = this.startSubscription({
      method: "terminal.sessions",
      onNotification: (event) => handlers.onData(event),
      registeredWithDaemon: false,
    });
    return Promise.resolve({
      unsubscribe: () => {
        this.subscriptionsById.delete(subscriptionId);
      },
    });
  }

  /** Tears down one terminal subscription: registry, frame index, daemon side. */
  private teardownTerminalSubscription(subscriptionId: string, sessionId: string): void {
    const subscription = this.subscriptionsById.get(subscriptionId);
    if (!subscription) {
      return;
    }
    this.subscriptionsById.delete(subscriptionId);
    let hasRemainingSubscriptionForSession = false;
    for (const candidate of this.subscriptionsById.values()) {
      if (candidate.method !== "terminal.subscribe") {
        continue;
      }
      if (readOptionalString(asRecord(candidate.params)?.sessionId) === sessionId) {
        hasRemainingSubscriptionForSession = true;
        break;
      }
    }
    if (!hasRemainingSubscriptionForSession) {
      this.terminalNextIndexBySessionId.delete(sessionId);
    }
    if (subscription.registeredWithDaemon) {
      void this.invoke("terminal.unsubscribe", { sessionId }).catch(() => undefined);
    }
  }

  /** Registers a new subscription and returns its id. */
  startSubscription(options: {
    method: string;
    params?: unknown;
    onNotification: (event: DaemonNotification) => void;
    registeredWithDaemon: boolean;
  }): string {
    const subscriptionId = generateId();
    this.subscriptionsById.set(subscriptionId, {
      method: options.method,
      params: options.params,
      onNotification: options.onNotification,
      registeredWithDaemon: options.registeredWithDaemon,
    });
    return subscriptionId;
  }

  hasSubscriptionForSession(sessionId: string): boolean {
    for (const subscription of this.subscriptionsById.values()) {
      if (subscription.method !== "terminal.subscribe") {
        continue;
      }
      if (readOptionalString(asRecord(subscription.params)?.sessionId) === sessionId) {
        return true;
      }
    }
    return false;
  }

  dropSubscriptionsForSession(sessionId: string): void {
    for (const [subscriptionId, subscription] of this.subscriptionsById.entries()) {
      if (subscription.method !== "terminal.subscribe") {
        continue;
      }
      if (readOptionalString(asRecord(subscription.params)?.sessionId) === sessionId) {
        this.subscriptionsById.delete(subscriptionId);
      }
    }
  }
}

let cachedTerminalRpc: DaemonTerminalClient | null = null;

/**
 * Lazily resolves the terminal Domain RPC adapter over the root transport
 * (dependency direction: Domain RPC adapter → root RPC transport).
 * Worktree→workspace-id resolution comes from the Workspace public API.
 */
export async function getTerminalRpc(): Promise<DaemonTerminalClient> {
  if (!cachedTerminalRpc) {
    const transport = await getDaemonTransport();
    cachedTerminalRpc = new DaemonTerminalClient({
      invoke: transport.invoke,
      resolveWorkspaceId: resolveWorkspaceIdCommand,
      sendBinary: transport.sendBinary,
      getSocketReadyState: transport.getSocketReadyState,
      subscriptionsById: transport.subscriptionsById as DaemonTerminalClient["subscriptionsById"],
      terminalNextIndexBySessionId: transport.terminalNextIndexBySessionId,
      startRawSubscription: (options) => transport.startRawSubscription(options),
    });
  }
  return cachedTerminalRpc;
}
