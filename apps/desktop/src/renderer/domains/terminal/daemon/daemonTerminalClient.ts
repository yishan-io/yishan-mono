import { resolveWorkspaceId as resolveWorkspaceIdCommand } from "@renderer/domains/workspace";
import { subscribeDesktopRpcEvent as subscribeDesktopRpcEventFromBus } from "@renderer/events/desktopRpcEventBus";
import {
  type DaemonNotification,
  request,
  sendBinary as sendRawBinary,
  subscribe as subscribeTransport,
  subscribeBinary as subscribeTransportBinary,
  subscribeConnectionStatus as subscribeTransportConnectionStatus,
} from "@renderer/rpc";
import {
  asRecord,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
} from "@shared/validation/primitiveReaders";
import type {
  SetActiveWorkspaceInput,
  SetActiveWorkspaceResponse,
  TerminalCloseInput,
  TerminalCreateSessionInput,
  TerminalCreateSessionResponse,
  TerminalDetectedPort,
  TerminalKillProcessInput,
  TerminalListSessionsInput,
  TerminalMutationOkResponse,
  TerminalReadOutputInput,
  TerminalReadOutputResponse,
  TerminalResizeInput,
  TerminalResourceUsageSnapshot,
  TerminalSessionSummary,
  TerminalStreamEvent,
  TerminalWriteInput,
} from "./terminalWireTypes";

export function subscribeDesktopRpcEvent(listener: (event: { method: string; payload?: unknown }) => void): () => void {
  return subscribeDesktopRpcEventFromBus(listener);
}

export function subscribeDaemonConnectionStatus(
  listener: (status: "connected" | "connecting" | "disconnected") => void,
): () => void {
  return subscribeTransportConnectionStatus(listener);
}

type InvokeFn = (method: string, params?: unknown) => Promise<unknown>;
type ResolveWorkspaceIdFn = (input: {
  workspaceId?: string;
  workspaceWorktreePath?: string;
  cwd?: string;
}) => Promise<string>;
type SubscribeFn = (
  method: string,
  params: unknown,
  listener: (event: DaemonNotification) => void,
  options?: { registerWithDaemon?: boolean },
) => () => void;

const terminalFrameTextEncoder = new TextEncoder();
const terminalFrameTextDecoder = new TextDecoder();
// Frame format: [opcode] [sessionId + '\0'] [bytes]
const TERMINAL_INPUT_OPCODE = 0x01;
const TERMINAL_OUTPUT_OPCODE = 0x02;

/** Terminal namespace methods for the daemon RPC client. */
export class DaemonTerminalClient {
  private readonly invoke: InvokeFn;
  private readonly resolveWorkspaceId: ResolveWorkspaceIdFn;
  private readonly subscribeTransport: SubscribeFn;
  private socketOpen = false;

  private readonly subscriptionsById = new Map<
    string,
    {
      method: string;
      params?: unknown;
      onNotification: (event: DaemonNotification) => void;
      registerWithDaemon: boolean;
    }
  >();

  readonly terminalNextIndexBySessionId = new Map<string, number>();

  constructor(options: {
    invoke: InvokeFn;
    resolveWorkspaceId: ResolveWorkspaceIdFn;
    subscribeTransport: SubscribeFn;
    sendBinary: (frame: Uint8Array) => void;
    subscribeBinary: (listener: (frame: ArrayBuffer) => void) => () => void;
    subscribeConnectionStatus: (listener: (status: "connected" | "connecting" | "disconnected") => void) => () => void;
  }) {
    this.invoke = options.invoke;
    this.resolveWorkspaceId = options.resolveWorkspaceId;
    this.subscribeTransport = options.subscribeTransport;

    options.subscribeConnectionStatus((status) => {
      this.socketOpen = status === "connected";
    });

    // Root RPC delivers raw binary frames; this adapter owns the terminal
    // frame codec and routes decoded output to its terminal.subscribe
    // subscriptions.
    options.subscribeBinary((frame) => {
      this.handleBinaryFrame(frame);
    });
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
    if (this.socketOpen) {
      this.sendTerminalInputBinary(sessionId, data);
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
    const unsubscribeTerminal = this.subscribeTerminal({
      method: "terminal.subscribe",
      params: { sessionId },
      registerWithDaemon: true,
      onNotification: (event) => {
        if (event.method === "terminal.output") {
          const payload = asRecord(event.payload) ?? {};
          const eventSessionId = readOptionalString(payload.sessionId) || sessionId;
          const rawChunk = payload.chunk;
          const chunk = rawChunk instanceof Uint8Array ? rawChunk : typeof rawChunk === "string" ? rawChunk : "";
          const nextIndex = (this.terminalNextIndexBySessionId.get(eventSessionId) ?? 0) + 1;
          this.terminalNextIndexBySessionId.set(eventSessionId, nextIndex);
          handlers.onData({ type: "output", sessionId: eventSessionId, chunk, nextIndex });
          return;
        }
        if (event.method === "terminal.exit") {
          const payload = asRecord(event.payload) ?? {};
          handlers.onData({
            type: "exit",
            sessionId: readOptionalString(payload.sessionId) || sessionId,
            exitCode: readOptionalNumber(payload.exitCode),
          });
          return;
        }
        handlers.onData(event);
      },
    });
    return Promise.resolve({
      unsubscribe: () => {
        unsubscribeTerminal();
        this.teardownTerminalSubscription(sessionId);
      },
    });
  }

  /** Subscribes one listener to global terminal session lifecycle updates. */
  subscribeSessions(
    _input: undefined,
    handlers: { onData: (event: unknown) => void; onError?: (error: unknown) => void },
  ): Promise<{ unsubscribe: () => void }> {
    const unsubscribeTerminal = this.subscribeTerminal({
      method: "terminal.sessions",
      params: undefined,
      registerWithDaemon: false,
      onNotification: (event) => handlers.onData(event),
    });
    return Promise.resolve({ unsubscribe: unsubscribeTerminal });
  }

  /** Registers one terminal subscription locally and with the transport. */
  private subscribeTerminal(options: {
    method: string;
    params?: unknown;
    onNotification: (event: DaemonNotification) => void;
    registerWithDaemon: boolean;
  }): () => void {
    const subscriptionId = `terminal-sub-${Math.random().toString(36).slice(2)}`;
    this.subscriptionsById.set(subscriptionId, {
      method: options.method,
      params: options.params,
      onNotification: options.onNotification,
      registerWithDaemon: options.registerWithDaemon,
    });
    const unsubscribeTransport = this.subscribeTransport(
      options.method,
      options.params,
      (event) => {
        const subscription = this.subscriptionsById.get(subscriptionId);
        if (!subscription) {
          return;
        }
        subscription.onNotification(event);
      },
      { registerWithDaemon: options.registerWithDaemon },
    );
    // The daemon pushes terminal.exit notifications on the same subscription
    // stream as terminal.subscribe, but the transport dispatches notifications
    // by exact method match. Register a shadow terminal.exit transport
    // subscription so exit events reach the same handler (desktop8 Phase 31
    // rewrite lost the method-agnostic matching of the pre-refactor client).
    let unsubscribeExitTransport: (() => void) | null = null;
    if (options.method === "terminal.subscribe") {
      unsubscribeExitTransport = this.subscribeTransport(
        "terminal.exit",
        options.params,
        (event) => {
          const subscription = this.subscriptionsById.get(subscriptionId);
          if (!subscription) {
            return;
          }
          subscription.onNotification(event);
        },
        { registerWithDaemon: false },
      );
    }
    return () => {
      this.subscriptionsById.delete(subscriptionId);
      unsubscribeTransport();
      unsubscribeExitTransport?.();
    };
  }

  /** Tears down terminal state for one session: registry, frame index, daemon side. */
  private teardownTerminalSubscription(sessionId: string): void {
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
    void this.invoke("terminal.unsubscribe", { sessionId }).catch(() => undefined);
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

  // ─── Binary frame codec (desktop8 Phase 31: owned by Terminal Infra) ───────

  /** Sends terminal input as a binary WebSocket frame: [0x01] [sessionId + '\0'] [input bytes]. */
  private sendTerminalInputBinary(sessionId: string, data: string | Uint8Array): void {
    try {
      const sessionIdBytes = terminalFrameTextEncoder.encode(sessionId);
      const inputBytes = typeof data === "string" ? terminalFrameTextEncoder.encode(data) : data;
      const frame = new Uint8Array(1 + sessionIdBytes.length + 1 + inputBytes.length);
      frame[0] = TERMINAL_INPUT_OPCODE;
      frame.set(sessionIdBytes, 1);
      frame[1 + sessionIdBytes.length] = 0;
      frame.set(inputBytes, 1 + sessionIdBytes.length + 1);
      sendRawBinary(frame);
    } catch {
      // Best-effort: silently drop if the transport socket is in a bad state.
    }
  }

  /** Decodes one incoming binary frame: [0x02] [sessionId + '\0'] [raw PTY bytes]. */
  private handleBinaryFrame(buffer: ArrayBuffer): void {
    const data = new Uint8Array(buffer);
    if (data.length < 3) {
      return;
    }

    const opcode = data[0];
    if (opcode !== TERMINAL_OUTPUT_OPCODE) {
      return; // Only terminal output is expected as binary.
    }

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

    // Dispatch as a terminal output event to matching terminal.subscribe
    // subscriptions.
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
        payload: { type: "output", sessionId, chunk },
      });
    }
  }
}

let cachedTerminalRpc: DaemonTerminalClient | null = null;

/**
 * Lazily resolves the terminal Domain RPC adapter over the root transport
 * (dependency direction: Domain RPC adapter → root RPC public API).
 * Worktree→workspace-id resolution comes from the Workspace public API.
 */
export async function getTerminalRpc(): Promise<DaemonTerminalClient> {
  if (!cachedTerminalRpc) {
    cachedTerminalRpc = new DaemonTerminalClient({
      invoke: request,
      resolveWorkspaceId: resolveWorkspaceIdCommand,
      subscribeTransport: subscribeTransport,
      sendBinary: sendRawBinary,
      subscribeBinary: subscribeTransportBinary,
      subscribeConnectionStatus: subscribeTransportConnectionStatus,
    });
  }
  return cachedTerminalRpc;
}
