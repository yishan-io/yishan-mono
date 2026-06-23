import { RelayRequestFailedError } from "@/errors";
import { type WorkspaceRelayContext, type WorkspaceRelayDeps, invokeWorkspaceRelay } from "@/services/workspace-relay";

export type WorkspaceTerminalSessionView = {
  sessionId: string;
  workspaceId: string;
  tabId?: string;
  paneId?: string;
  pid: number;
  status: "running" | "exited";
  startedAt?: string;
  exitedAt?: string;
};

export type WorkspaceTerminalStartView = {
  sessionId: string;
};

export async function listWorkspaceTerminalSessionsViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    includeExited?: boolean;
  },
): Promise<WorkspaceTerminalSessionView[]> {
  const { result } = await invokeWorkspaceRelay<unknown[]>({
    ...deps,
    ...input,
    method: "terminal.listSessions",
    params: {
      includeExited: input.includeExited ?? false,
      workspaceId: input.workspaceId,
    },
  });

  if (!Array.isArray(result)) {
    return [];
  }

  return result.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : null;
    const workspaceId = typeof record.workspaceId === "string" ? record.workspaceId : null;
    const pid = typeof record.pid === "number" ? record.pid : null;
    const status = record.status === "running" || record.status === "exited" ? record.status : null;

    if (!sessionId || !workspaceId || pid === null || !status || workspaceId !== input.workspaceId) {
      return [];
    }

    return [
      {
        exitedAt: typeof record.exitedAt === "string" ? record.exitedAt : undefined,
        paneId: typeof record.paneId === "string" ? record.paneId : undefined,
        pid,
        sessionId,
        startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
        status,
        tabId: typeof record.tabId === "string" ? record.tabId : undefined,
        workspaceId,
      },
    ];
  });
}

export async function startWorkspaceTerminalViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    args?: string[];
    cols?: number;
    command?: string;
    env?: Record<string, string> | string[];
    paneId?: string;
    rows?: number;
    tabId?: string;
  },
): Promise<WorkspaceTerminalStartView> {
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method: "terminal.start",
    params: {
      args: input.args ?? [],
      cols: typeof input.cols === "number" ? input.cols : undefined,
      command: input.command?.trim() ?? "",
      env: normalizeTerminalEnv(input.env),
      paneId: input.paneId?.trim() ?? "",
      rows: typeof input.rows === "number" ? input.rows : undefined,
      tabId: input.tabId?.trim() ?? "",
      workspaceId: input.workspaceId,
    },
  });

  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
  if (!sessionId) {
    throw new RelayRequestFailedError("terminal.start", {
      reason: "missing_session_id",
      workspaceId: input.workspaceId,
    });
  }

  return { sessionId };
}

export async function stopWorkspaceTerminalViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    sessionId: string;
  },
): Promise<void> {
  await invokeWorkspaceRelay({
    ...deps,
    ...input,
    method: "terminal.stop",
    params: {
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
    },
  });
}

function normalizeTerminalEnv(env: Record<string, string> | string[] | undefined): string[] {
  if (Array.isArray(env)) {
    return env;
  }

  if (!env) {
    return [];
  }

  return Object.entries(env).map(([key, value]) => `${key}=${value}`);
}
