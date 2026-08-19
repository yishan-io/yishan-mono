/**
 * Terminal wire DTOs (desktop8 Phase 33: split from the terminal RPC client).
 *
 * Daemon payload shapes and terminal stream event types are the transport
 * contract between the renderer and the daemon.
 */

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
 * Terminal wire DTOs + frame codec (desktop8 Phase 31). Owned by the Terminal
 * Domain Infrastructure: the binary frame codec, the subscription registry,
 * and the frame indexes moved out of root RPC into this adapter.
 */
