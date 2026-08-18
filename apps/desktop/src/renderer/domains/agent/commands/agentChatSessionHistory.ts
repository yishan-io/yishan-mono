import type * as Rpc from "../../../rpc/daemonTypes";
import { getDaemonClient } from "../../../rpc/rpcTransport";

/** Fetches past session summaries for the current working directory. */
export async function fetchSessionHistory(cwd: string): Promise<Rpc.PiSessionSummary[]> {
  const client = await getDaemonClient();
  return (await client.pi.listSessions({ cwd })) as Rpc.PiSessionSummary[];
}

/** Resolves the transcript file path for one pi session. Empty when no transcript exists yet. */
export async function fetchAgentSessionFilePath(sessionId: string, cwd: string): Promise<string> {
  const client = await getDaemonClient();
  const result = (await client.pi.getSessionFile({ sessionId, cwd })) as Rpc.PiGetSessionFileResult;
  return result.filePath;
}

/** Fetches live Pi sessions currently held by the daemon. */
export async function listActivePiSessions(): Promise<Rpc.PiActiveSessionSummary[]> {
  const client = await getDaemonClient();
  return (await client.pi.listActiveSessions({})) as Rpc.PiActiveSessionSummary[];
}
