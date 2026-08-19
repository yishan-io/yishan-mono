import {
  getPiSessionFile as getPiSessionFileProcedure,
  listActivePiSessions as listActivePiSessionsProcedure,
  listPiSessions as listPiSessionsProcedure,
} from "../daemon/daemonAgentProcedures";
import type * as Rpc from "../daemon/daemonAgentTypes";

/** Fetches past session summaries for the current working directory. */
export async function fetchSessionHistory(cwd: string): Promise<Rpc.PiSessionSummary[]> {
  return listPiSessionsProcedure({ cwd });
}

/** Resolves the transcript file path for one pi session. Empty when no transcript exists yet. */
export async function fetchAgentSessionFilePath(sessionId: string, cwd: string): Promise<string> {
  const result = await getPiSessionFileProcedure({ sessionId, cwd });
  return result.filePath;
}

/** Fetches live Pi sessions currently held by the daemon. */
export async function listActivePiSessions(): Promise<Rpc.PiActiveSessionSummary[]> {
  return listActivePiSessionsProcedure({});
}
