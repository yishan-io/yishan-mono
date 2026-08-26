import { workspaceStore } from "@renderer/domains/workspace";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import {
  getAgentCapabilities,
  listActivePiCompatibilitySessions as listActivePiSessionsProcedure,
  listAgentRuntimeSessions as listAgentRuntimeSessionsProcedure,
  readAgentRuntimeHistory as readAgentRuntimeHistoryProcedure,
} from "../daemon/daemonAgentProcedures";
import type * as Rpc from "../daemon/daemonAgentTypes";

/** Lists durable sessions for a runtime in the open workspace at cwd. */
export async function listAgentSessionHistory(
  cwd: string,
  runtime: Rpc.AgentRuntime = "pi",
): Promise<Rpc.AgentSessionSummary[]> {
  const workspaceId = resolveOpenWorkspaceId(cwd);
  const result = await listAgentRuntimeSessionsProcedure({ runtime, workspaceId, cwd });
  return result.sessions;
}

/** Reads durable history for a runtime session in the open workspace at cwd. */
export async function readAgentSessionHistory(
  sessionId: string,
  cwd: string,
  runtime: Rpc.AgentRuntime = "pi",
): Promise<Rpc.AgentHistoryResult> {
  const workspaceId = resolveOpenWorkspaceId(cwd);
  return await readAgentRuntimeHistoryProcedure({ runtime, sessionId, workspaceId, cwd });
}

/** A durable agent session summary with an explicit runtime identity for UI selection. */
export type RuntimeAgentSessionSummary = Rpc.AgentSessionSummary & { runtime: Rpc.AgentRuntime };

/** Fetches Pi history and ready DSH history for the current working directory. */
export async function fetchSessionHistory(cwd: string): Promise<RuntimeAgentSessionSummary[]> {
  const piSessions = (await listAgentSessionHistory(cwd, "pi")).map((session) => ({
    ...session,
    runtime: "pi" as const,
  }));
  try {
    const capabilities = await getAgentCapabilities();
    if (!capabilities.dsh.configured || !capabilities.dsh.ready) return piSessions;

    const dshSessions = (await listAgentSessionHistory(cwd, "dsh")).map((session) => ({
      ...session,
      runtime: "dsh" as const,
    }));
    return [...piSessions, ...dshSessions].sort((left, right) => right.createdAt - left.createdAt);
  } catch (error) {
    console.warn("Failed to load DSH session history; showing Pi history", getErrorMessage(error));
    return piSessions;
  }
}

/** Resolves the transcript file path for one Pi session. Empty when no transcript exists yet. */
export async function fetchAgentSessionFilePath(sessionId: string, cwd: string): Promise<string> {
  const history = await readAgentSessionHistory(sessionId, cwd);
  if (history.runtime !== "pi") {
    throw new Error("Pi session history returned a non-Pi runtime");
  }
  return history.pi.filePath;
}

/** Fetches live Pi sessions currently held by the daemon. */
export async function listActivePiSessions(): Promise<Rpc.PiActiveSessionSummary[]> {
  return await listActivePiSessionsProcedure({});
}

function resolveOpenWorkspaceId(cwd: string): string {
  const workspace = workspaceStore.getState().workspaces.find((candidate) => candidate.worktreePath === cwd);
  if (!workspace) {
    throw new Error(`No open workspace matches cwd: ${cwd}`);
  }
  return workspace.id;
}
