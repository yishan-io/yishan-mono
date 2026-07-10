import type { WorkspaceTerminalOutput } from "@/features/workspaces/workspaces.types";

/**
 * Describes one measured terminal size.
 */
export type TerminalTransportSize = {
  cols: number;
  rows: number;
};

/**
 * Describes the callbacks exposed by one live terminal transport.
 */
export type TerminalTransportHandlers = {
  onError: (error: Error) => void;
  onExit: (exitCode?: number | null) => void;
  onMessageDebug?: (payload: unknown) => void;
  onOutput: (output: string) => void;
  onSnapshot: (snapshot: WorkspaceTerminalOutput) => void;
  onStateDebug?: (payload: unknown) => void;
};

/**
 * Describes the mobile terminal transport contract used by the relay-backed runtime.
 */
export type TerminalTransport = {
  connect: () => void;
  dispose: () => void;
  resize: (size: TerminalTransportSize) => Promise<void>;
  send: (input: string) => Promise<void>;
};
