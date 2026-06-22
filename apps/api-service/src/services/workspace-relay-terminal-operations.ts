import type { AppDb } from "@/db/client";
import { RelayRequestFailedError } from "@/errors";
import type { OrganizationService } from "@/services/organization-service";
import { invokeWorkspaceRelay } from "@/services/workspace-relay";
import type { ServiceConfig } from "@/types";

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

export type WorkspaceTerminalReadView = {
  output: string;
  running: boolean;
  exitCode?: number | null;
};

type WorkspaceRelayDeps = {
  config: ServiceConfig;
  db: AppDb;
  organizationService: OrganizationService;
};

export async function listWorkspaceTerminalSessionsViaRelay(
  deps: WorkspaceRelayDeps,
  input: {
    actorUserId: string;
    includeExited?: boolean;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  },
): Promise<WorkspaceTerminalSessionView[]> {
  const { result } = await invokeWorkspaceRelay<unknown[]>({
    actorUserId: input.actorUserId,
    config: deps.config,
    db: deps.db,
    method: "terminal.listSessions",
    organizationId: input.organizationId,
    organizationService: deps.organizationService,
    params: {
      includeExited: input.includeExited ?? false,
      workspaceId: input.workspaceId,
    },
    projectId: input.projectId,
    workspaceId: input.workspaceId,
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
  input: {
    actorUserId: string;
    args?: string[];
    cols?: number;
    command?: string;
    env?: Record<string, string> | string[];
    organizationId: string;
    paneId?: string;
    projectId: string;
    rows?: number;
    tabId?: string;
    workspaceId: string;
  },
): Promise<WorkspaceTerminalStartView> {
  const { result } = await invokeWorkspaceRelay<unknown>({
    actorUserId: input.actorUserId,
    config: deps.config,
    db: deps.db,
    method: "terminal.start",
    organizationId: input.organizationId,
    organizationService: deps.organizationService,
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
    projectId: input.projectId,
    workspaceId: input.workspaceId,
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

export async function sendWorkspaceTerminalInputViaRelay(
  deps: WorkspaceRelayDeps,
  input: {
    actorUserId: string;
    data: string;
    organizationId: string;
    projectId: string;
    sessionId: string;
    workspaceId: string;
  },
): Promise<void> {
  await invokeWorkspaceRelay({
    actorUserId: input.actorUserId,
    config: deps.config,
    db: deps.db,
    method: "terminal.send",
    organizationId: input.organizationId,
    organizationService: deps.organizationService,
    params: {
      input: input.data,
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
    },
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
}

export async function readWorkspaceTerminalOutputViaRelay(
  deps: WorkspaceRelayDeps,
  input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    sessionId: string;
    workspaceId: string;
  },
): Promise<WorkspaceTerminalReadView> {
  const { result } = await invokeWorkspaceRelay<unknown>({
    actorUserId: input.actorUserId,
    config: deps.config,
    db: deps.db,
    method: "terminal.read",
    organizationId: input.organizationId,
    organizationService: deps.organizationService,
    params: {
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
    },
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });

  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {};

  return {
    exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
    output: typeof record.output === "string" ? record.output : "",
    running: record.running === true,
  };
}

export async function resizeWorkspaceTerminalViaRelay(
  deps: WorkspaceRelayDeps,
  input: {
    actorUserId: string;
    cols: number;
    organizationId: string;
    projectId: string;
    rows: number;
    sessionId: string;
    workspaceId: string;
  },
): Promise<void> {
  await invokeWorkspaceRelay({
    actorUserId: input.actorUserId,
    config: deps.config,
    db: deps.db,
    method: "terminal.resize",
    organizationId: input.organizationId,
    organizationService: deps.organizationService,
    params: {
      cols: input.cols,
      rows: input.rows,
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
    },
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
}

export async function stopWorkspaceTerminalViaRelay(
  deps: WorkspaceRelayDeps,
  input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    sessionId: string;
    workspaceId: string;
  },
): Promise<void> {
  await invokeWorkspaceRelay({
    actorUserId: input.actorUserId,
    config: deps.config,
    db: deps.db,
    method: "terminal.stop",
    organizationId: input.organizationId,
    organizationService: deps.organizationService,
    params: {
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
    },
    projectId: input.projectId,
    workspaceId: input.workspaceId,
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
