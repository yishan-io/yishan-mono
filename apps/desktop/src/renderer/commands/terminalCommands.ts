import type {
  TerminalCreateSessionInput,
  TerminalListSessionsInput,
  TerminalResourceUsageSnapshot,
  TerminalSessionLifecycleEvent,
  TerminalSessionSummary,
  TerminalStreamEvent,
} from "../rpc/daemonTypes";
import type { TerminalDetectedPort } from "../rpc/daemonTypes";
import { getDaemonClient } from "../rpc/rpcTransport";
import type { DaemonRpcClient } from "../rpc/types";

export type { TerminalDetectedPort } from "../rpc/daemonTypes";

type TerminalCreateSessionParams = TerminalCreateSessionInput;

export type TerminalOutputEvent = TerminalStreamEvent;

/**
 * Cached daemon client reference for the terminal input hot path.
 * Avoids awaiting the (already-resolved) `getDaemonClient()` promise
 * on every keystroke, eliminating one microtask per input event.
 */
let cachedDaemonClient: DaemonRpcClient | null = null;

/** Creates one PTY-backed terminal session and returns resolved dimensions. */
export async function createTerminalSession(params: TerminalCreateSessionParams) {
  const client = await getDaemonClient();
  cachedDaemonClient = client;
  return client.terminal.createSession(params);
}

/** Writes one raw keystroke/input chunk to one terminal session. */
export async function writeTerminalInput(params: { workspaceId?: string; sessionId: string; data: string | Uint8Array }) {
  // Fast path: use cached client to avoid microtask overhead on every keystroke.
  if (cachedDaemonClient) {
    return cachedDaemonClient.terminal.writeInput(params);
  }
  const client = await getDaemonClient();
  cachedDaemonClient = client;
  return client.terminal.writeInput(params);
}

/** Resizes one terminal session viewport. */
export async function resizeTerminal(params: { workspaceId?: string; sessionId: string; cols: number; rows: number }) {
  const client = await getDaemonClient();
  return client.terminal.resize(params);
}

/** Reads buffered output from one terminal session at one index cursor. */
export async function readTerminalOutput(params: { workspaceId?: string; sessionId: string; fromIndex: number }) {
  const client = await getDaemonClient();
  return client.terminal.readOutput(params);
}

/** Closes one active terminal session and releases runtime resources. */
export async function closeTerminalSession(params: { workspaceId?: string; sessionId: string }) {
  const client = await getDaemonClient();
  return client.terminal.closeSession(params);
}

/** Terminates one process id associated with terminal workloads. */
export async function killTerminalProcess(params: { pid: number }) {
  const client = await getDaemonClient();
  return client.terminal.killProcess(params);
}

/** Lists currently detected listening ports for active terminal sessions. */
export async function listDetectedPorts(): Promise<TerminalDetectedPort[]> {
  const client = await getDaemonClient();
  return await client.terminal.listDetectedPorts();
}

/** Sets daemon active workspace context for background optimizations. */
export async function setActiveWorkspace(params: { workspaceId?: string }): Promise<{ updated: boolean }> {
  const client = await getDaemonClient();
  return await client.terminal.setActiveWorkspace({ workspaceId: params.workspaceId });
}

/** Returns one snapshot of terminal CPU/memory usage and subprocess metrics. */
export async function getTerminalResourceUsage(): Promise<TerminalResourceUsageSnapshot> {
  const client = await getDaemonClient();
  return await client.terminal.getResourceUsage();
}

/** Lists current terminal sessions for global session management UI. */
export async function listTerminalSessions(params?: TerminalListSessionsInput): Promise<TerminalSessionSummary[]> {
  const client = await getDaemonClient();
  return await client.terminal.listSessions(params ?? {});
}

/** Subscribes one listener to live terminal output and exit events over websocket. */
export async function subscribeTerminalOutput(params: {
  workspaceId?: string;
  sessionId: string;
  onData: (event: TerminalOutputEvent) => void;
  onError?: (error: unknown) => void;
}) {
  const client = await getDaemonClient();
  return client.terminal.subscribeOutput.subscribe(
    { sessionId: params.sessionId, workspaceId: params.workspaceId },
    {
      onData: (event) => params.onData(event as TerminalOutputEvent),
      onError: params.onError,
    },
  );
}

/** Subscribes one listener to global terminal session lifecycle updates over websocket. */
export async function subscribeTerminalSessions(params: {
  onData: (event: TerminalSessionLifecycleEvent) => void;
  onError?: (error: unknown) => void;
}) {
  const client = await getDaemonClient();
  return client.terminal.subscribeSessions.subscribe(undefined, {
    onData: (event) => params.onData(event as TerminalSessionLifecycleEvent),
    onError: params.onError,
  });
}
