import { generateId } from "../helpers/generateId";
import type * as Rpc from "./daemonTypes";
import { asRecord, readOptionalNumber, readOptionalString, readOptionalStringArray } from "./helpers";

type InvokeFn = (method: string, params?: unknown) => Promise<unknown>;
type SendBinaryFn = (sessionId: string, data: string | Uint8Array) => void;

const terminalFrameTextDecoder = new TextDecoder();

/** Terminal namespace methods for the daemon RPC client. */
export class DaemonTerminalClient {
  private readonly invoke: InvokeFn;
  private readonly resolveWorkspaceId: (input: unknown) => Promise<string>;
  private readonly sendBinary: SendBinaryFn;
  private readonly getSocketReadyState: () => number | null;
  readonly terminalNextIndexBySessionId = new Map<string, number>();

  readonly subscriptionsById: Map<
    string,
    {
      method: string;
      params?: unknown;
      onNotification: (event: Rpc.DaemonNotification) => void;
      registeredWithDaemon: boolean;
    }
  >;

  constructor(options: {
    invoke: InvokeFn;
    resolveWorkspaceId: (input: unknown) => Promise<string>;
    sendBinary: SendBinaryFn;
    getSocketReadyState: () => number | null;
    subscriptionsById: DaemonTerminalClient["subscriptionsById"];
  }) {
    this.invoke = options.invoke;
    this.resolveWorkspaceId = options.resolveWorkspaceId;
    this.sendBinary = options.sendBinary;
    this.getSocketReadyState = options.getSocketReadyState;
    this.subscriptionsById = options.subscriptionsById;
  }

  async createSession(input: Rpc.TerminalCreateSessionInput): Promise<Rpc.TerminalCreateSessionResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    return (await this.invoke("terminal.start", {
      workspaceId,
      command: readOptionalString(record?.command),
      args: readOptionalStringArray(record?.args),
      env: readOptionalStringArray(record?.env),
      tabId: readOptionalString(record?.tabId),
      paneId: readOptionalString(record?.paneId),
    })) as Rpc.TerminalCreateSessionResponse;
  }

  async writeInput(input: Rpc.TerminalWriteInput): Promise<Rpc.TerminalMutationOkResponse> {
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

  async resize(input: Rpc.TerminalResizeInput): Promise<Rpc.TerminalMutationOkResponse> {
    const record = asRecord(input);
    await this.invoke("terminal.resize", {
      sessionId: readOptionalString(record?.sessionId) || "",
      cols: Math.max(1, Math.floor(readOptionalNumber(record?.cols) ?? 80)),
      rows: Math.max(1, Math.floor(readOptionalNumber(record?.rows) ?? 24)),
    });
    return { ok: true };
  }

  async closeSession(input: Rpc.TerminalCloseInput): Promise<Rpc.TerminalMutationOkResponse> {
    const record = asRecord(input);
    const sessionId = readOptionalString(record?.sessionId) || "";
    await this.invoke("terminal.stop", { sessionId });
    this.dropSubscriptionsForSession(sessionId);
    this.terminalNextIndexBySessionId.delete(sessionId);
    return { ok: true };
  }

  async killProcess(input: Rpc.TerminalKillProcessInput): Promise<Rpc.TerminalMutationOkResponse> {
    const record = asRecord(input);
    const pid = Math.floor(readOptionalNumber(record?.pid) ?? 0);
    await this.invoke("terminal.killProcess", { pid });
    return { ok: true };
  }

  async readOutput(input: Rpc.TerminalReadOutputInput): Promise<Rpc.TerminalReadOutputResponse> {
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

  async listDetectedPorts(): Promise<Rpc.TerminalDetectedPort[]> {
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

  async setActiveWorkspace(input: Rpc.SetActiveWorkspaceInput): Promise<Rpc.SetActiveWorkspaceResponse> {
    const record = asRecord(input);
    return (await this.invoke("workspace.setActive", {
      workspaceId: readOptionalString(record?.workspaceId),
    })) as Rpc.SetActiveWorkspaceResponse;
  }

  async getResourceUsage(): Promise<Rpc.TerminalResourceUsageSnapshot> {
    return { processes: [] };
  }

  async listSessions(input?: Rpc.TerminalListSessionsInput): Promise<Rpc.TerminalSessionSummary[]> {
    return (await this.invoke("terminal.listSessions", input ?? {})) as Rpc.TerminalSessionSummary[];
  }

  /** Registers a new subscription and returns its id. */
  startSubscription(options: {
    method: string;
    params?: unknown;
    onNotification: (event: Rpc.DaemonNotification) => void;
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
