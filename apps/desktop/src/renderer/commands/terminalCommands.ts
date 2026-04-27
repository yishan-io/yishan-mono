import type {
  TerminalCreateSessionInput,
  TerminalDetectedPort,
  TerminalListSessionsInput,
  TerminalResourceUsageSnapshot,
  TerminalSessionLifecycleEvent,
  TerminalSessionSummary,
  TerminalStreamEvent,
} from "@api-service/domain/terminal/types";
import { getDaemonClient } from "../rpc/rpcTransport";

type TerminalCreateSessionParams = TerminalCreateSessionInput;

export type TerminalOutputEvent = TerminalStreamEvent;

/** Creates one PTY-backed terminal session and returns resolved dimensions. */
export async function createTerminalSession(params?: TerminalCreateSessionParams) {
  const client = await getDaemonClient();
  return client.terminal.createSession(params ?? {});
}

/** Writes one raw keystroke/input chunk to one terminal session. */
export async function writeTerminalInput(params: { sessionId: string; data: string }) {
  const client = await getDaemonClient();
  return client.terminal.writeInput(params);
}

/** Resizes one terminal session viewport. */
export async function resizeTerminal(params: { sessionId: string; cols: number; rows: number }) {
  const client = await getDaemonClient();
  return client.terminal.resize(params);
}

/** Reads buffered output from one terminal session at one index cursor. */
export async function readTerminalOutput(params: { sessionId: string; fromIndex: number }) {
  const client = await getDaemonClient();
  return client.terminal.readOutput(params);
}

/** Closes one active terminal session and releases runtime resources. */
export async function closeTerminalSession(params: { sessionId: string }) {
  const client = await getDaemonClient();
  return client.terminal.closeSession(params);
}

/** Lists currently detected listening ports for active terminal sessions. */
export async function listDetectedPorts(): Promise<TerminalDetectedPort[]> {
  const client = await getDaemonClient();
  return await client.terminal.listDetectedPorts();
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
  sessionId: string;
  onData: (event: TerminalOutputEvent) => void;
  onError?: (error: unknown) => void;
}) {
  const client = await getDaemonClient();
  return client.terminal.subscribeOutput.subscribe(
    { sessionId: params.sessionId },
    {
      onData: params.onData,
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
    onData: params.onData,
    onError: params.onError,
  });
}
