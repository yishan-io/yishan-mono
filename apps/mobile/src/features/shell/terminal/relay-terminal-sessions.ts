import type { WorkspaceTerminalSession } from "@/features/workspaces/workspaces.types";
import { getRelayBaseUrl } from "@/lib/config/env";
import { withPooledRelayRequestClient } from "@/lib/relay/relay-request-client-pool";
import type { RelayStreamClient } from "@/lib/relay/relay-stream-client";

type RelayTerminalSessionSummary = {
  exitedAt?: string;
  paneId?: string;
  pid?: number;
  sessionId: string;
  startedAt?: string;
  status: string;
  tabId?: string;
  workspaceId: string;
};

export type RelayTerminalSessionCreateInput = {
  cols?: number;
  command?: string;
  args?: string[];
  env?: string[];
  orgId?: string;
  paneId?: string;
  projectId?: string;
  rows?: number;
  tabId?: string;
  workspaceId: string;
};

function requireNodeId(nodeId: string | null | undefined) {
  const normalizedNodeId = nodeId?.trim() ?? "";
  if (!normalizedNodeId) {
    throw new Error("Missing nodeId for relay terminal session.");
  }

  return normalizedNodeId;
}

function normalizeTerminalSession(session: RelayTerminalSessionSummary): WorkspaceTerminalSession {
  return {
    exitedAt: session.exitedAt,
    paneId: session.paneId,
    pid: typeof session.pid === "number" ? session.pid : 0,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    status: session.status === "running" ? "running" : "exited",
    tabId: session.tabId,
    workspaceId: session.workspaceId,
  };
}

async function withRelayTerminalClient<T>(
  input: {
    accessToken: string;
    nodeId: string | null | undefined;
  },
  action: (client: RelayStreamClient) => Promise<T>,
) {
  return withPooledRelayRequestClient(
    {
      accessToken: input.accessToken,
      nodeId: requireNodeId(input.nodeId),
      relayUrl: getRelayBaseUrl(),
    },
    action,
  );
}

export async function listRelayTerminalSessions(input: {
  accessToken: string;
  includeExited?: boolean;
  nodeId: string | null | undefined;
  workspaceId: string;
}): Promise<WorkspaceTerminalSession[]> {
  return withRelayTerminalClient(input, async (client) => {
    const sessions = await client.sendRequest<RelayTerminalSessionSummary[]>("terminal.listSessions", {
      includeExited: input.includeExited,
      workspaceId: input.workspaceId,
    });

    return sessions.map(normalizeTerminalSession);
  });
}

export async function startRelayTerminalSession(input: {
  accessToken: string;
  nodeId: string | null | undefined;
  request: RelayTerminalSessionCreateInput;
}): Promise<{ sessionId: string }> {
  return withRelayTerminalClient(input, async (client) => {
    return client.sendRequest<{ sessionId: string }>("terminal.start", input.request);
  });
}

export async function stopRelayTerminalSession(input: {
  accessToken: string;
  nodeId: string | null | undefined;
  sessionId: string;
}): Promise<void> {
  await withRelayTerminalClient(input, async (client) => {
    await client.sendRequest("terminal.stop", { sessionId: input.sessionId });
  });
}
