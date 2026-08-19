import { terminalFocusStore } from "../../../domains/terminal/state/terminalFocusStore";
import type {
  TerminalCreateSessionInput,
  TerminalListSessionsInput,
  TerminalResourceUsageSnapshot,
  TerminalSessionLifecycleEvent,
  TerminalSessionSummary,
  TerminalStreamEvent,
} from "../infrastructure/terminalWireTypes";
import type { TerminalDetectedPort } from "../infrastructure/terminalWireTypes";

export type { TerminalSessionSummary } from "../infrastructure/terminalWireTypes";
import { subscribeDesktopRpcEvent } from "../infrastructure/daemonTerminalClient";
import { getTerminalRpc } from "../infrastructure/daemonTerminalClient";
import type { DaemonTerminalClient } from "../infrastructure/daemonTerminalClient";

export type { TerminalDetectedPort } from "../infrastructure/terminalWireTypes";

type TerminalCreateSessionParams = TerminalCreateSessionInput;

export type TerminalOutputEvent = TerminalStreamEvent;

/** Consumes one pending auto-focus request for a mounted terminal tab. */
export function consumeTerminalTabFocus(tabId: string): boolean {
  return terminalFocusStore.getState().consumeFocus(tabId);
}

/** Records one pending auto-focus request for a new terminal tab. */
export function requestTerminalFocus(tabId: string): void {
  terminalFocusStore.getState().requestFocus(tabId);
}

/** Removes pending auto-focus requests for terminal tabs that are no longer open. */
export function retainOpenTerminalTabFocus(openTabIds: ReadonlySet<string>): void {
  terminalFocusStore.getState().retainOpenTabs(openTabIds);
}

/**
 * Cached daemon client reference for the terminal input hot path.
 * Avoids awaiting the (already-resolved) `getTerminalRpc()` promise
 * on every keystroke, eliminating one microtask per input event.
 */
let cachedTerminalRpc: DaemonTerminalClient | null = null;

/** Creates one PTY-backed terminal session and returns resolved dimensions. */
export async function createTerminalSession(params: TerminalCreateSessionParams) {
  const terminalRpc = await getTerminalRpc();
  cachedTerminalRpc = terminalRpc;
  return terminalRpc.createSession(params);
}

/** Writes one raw keystroke/input chunk to one terminal session. */
export async function writeTerminalInput(params: { sessionId: string; data: string | Uint8Array }) {
  // Fast path: use cached client to avoid microtask overhead on every keystroke.
  if (cachedTerminalRpc) {
    return cachedTerminalRpc.writeInput(params);
  }
  const terminalRpc = await getTerminalRpc();
  cachedTerminalRpc = terminalRpc;
  return terminalRpc.writeInput(params);
}

/** Resizes one terminal session viewport. */
export async function resizeTerminal(params: { sessionId: string; cols: number; rows: number }) {
  const terminalRpc = await getTerminalRpc();
  return terminalRpc.resize(params);
}

/** Reads buffered output from one terminal session at one index cursor. */
export async function readTerminalOutput(params: { sessionId: string; fromIndex: number }) {
  const terminalRpc = await getTerminalRpc();
  return terminalRpc.readOutput(params);
}

/** Closes one active terminal session and releases runtime resources. */
export async function closeTerminalSession(params: { sessionId: string }) {
  const terminalRpc = await getTerminalRpc();
  return terminalRpc.closeSession(params);
}

/** Terminates one process id associated with terminal workloads. */
export async function killTerminalProcess(params: { pid: number }) {
  const terminalRpc = await getTerminalRpc();
  return terminalRpc.killProcess(params);
}

/** Lists currently detected listening ports for active terminal sessions. */
export async function listDetectedPorts(): Promise<TerminalDetectedPort[]> {
  const terminalRpc = await getTerminalRpc();
  return await terminalRpc.listDetectedPorts();
}

/** Subscribes one listener to detected-port change events over websocket. */
export function subscribeDetectedPorts(
  onData: (ports: TerminalDetectedPort[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  return subscribeDesktopRpcEvent((event) => {
    if (event.method !== "terminalDetectedPortsChanged") {
      return;
    }
    try {
      onData((event.payload as { ports?: TerminalDetectedPort[] } | undefined)?.ports ?? []);
    } catch (error) {
      onError?.(error);
    }
  });
}

/** Sets daemon active workspace context for background optimizations. */
export async function setActiveWorkspace(params: { workspaceId?: string }): Promise<{ updated: boolean }> {
  const terminalRpc = await getTerminalRpc();
  return await terminalRpc.setActiveWorkspace({ workspaceId: params.workspaceId });
}

/** Returns one snapshot of terminal CPU/memory usage and subprocess metrics. */
export async function getTerminalResourceUsage(): Promise<TerminalResourceUsageSnapshot> {
  const terminalRpc = await getTerminalRpc();
  return await terminalRpc.getResourceUsage();
}

/** Lists current terminal sessions for global session management UI. */
export async function listTerminalSessions(params?: TerminalListSessionsInput): Promise<TerminalSessionSummary[]> {
  const terminalRpc = await getTerminalRpc();
  return await terminalRpc.listSessions(params ?? {});
}

/** Subscribes one listener to live terminal output and exit events over websocket. */
export async function subscribeTerminalOutput(params: {
  sessionId: string;
  onData: (event: TerminalOutputEvent) => void;
  onError?: (error: unknown) => void;
}) {
  const terminalRpc = await getTerminalRpc();
  return terminalRpc.subscribeOutput(
    { sessionId: params.sessionId },
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
  const terminalRpc = await getTerminalRpc();
  return terminalRpc.subscribeSessions(undefined, {
    onData: (event) => params.onData(event as TerminalSessionLifecycleEvent),
    onError: params.onError,
  });
}

export type { TerminalResourceUsageSnapshot } from "../infrastructure/terminalWireTypes";
