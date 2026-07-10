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

function invalidRelayPayload(
  method: string,
  workspaceId: string,
  reason: string,
  details?: Record<string, unknown>,
): RelayRequestFailedError {
  return new RelayRequestFailedError(method, {
    reason,
    workspaceId,
    ...(details ?? {}),
  });
}

function readRecord(
  method: string,
  workspaceId: string,
  value: unknown,
  field?: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRelayPayload(method, workspaceId, "invalid_payload", field ? { field } : undefined);
  }

  return value as Record<string, unknown>;
}

export async function listWorkspaceTerminalSessionsViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    includeExited?: boolean;
  },
): Promise<WorkspaceTerminalSessionView[]> {
  const method = "terminal.listSessions";
  const { result } = await invokeWorkspaceRelay<unknown[]>({
    ...deps,
    ...input,
    method,
    params: {
      includeExited: input.includeExited ?? false,
      workspaceId: input.workspaceId,
    },
  });

  if (!Array.isArray(result)) {
    throw invalidRelayPayload(method, input.workspaceId, "invalid_payload");
  }

  return result.map((entry) => {
    const record = readRecord(method, input.workspaceId, entry);
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : null;
    const workspaceId = typeof record.workspaceId === "string" ? record.workspaceId : null;
    const pid = typeof record.pid === "number" ? record.pid : null;
    const status = record.status === "running" || record.status === "exited" ? record.status : null;

    if (!sessionId || !workspaceId || pid === null || !status || workspaceId !== input.workspaceId) {
      throw invalidRelayPayload(method, input.workspaceId, "invalid_payload");
    }

    return {
      exitedAt: typeof record.exitedAt === "string" ? record.exitedAt : undefined,
      paneId: typeof record.paneId === "string" ? record.paneId : undefined,
      pid,
      sessionId,
      startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
      status,
      tabId: typeof record.tabId === "string" ? record.tabId : undefined,
      workspaceId,
    };
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
  const method = "terminal.start";
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method,
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

  const record = readRecord(method, input.workspaceId, result);
  const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
  if (!sessionId) {
    throw invalidRelayPayload(method, input.workspaceId, "missing_session_id");
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
