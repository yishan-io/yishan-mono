import type { DurableCursor } from "../shared/cursor";
import type { SubagentSettlementDiagnostic } from "./binding";
import type { AgentHandle } from "./types";

/** Appends terminal delegation metadata and checkpoints it before returning. */
export async function recordDurableSubagentSettlement(
  handle: AgentHandle,
  parentSessionId: string,
  flushSession: (request: { cwd: string; sessionId: string }) => Promise<DurableCursor>,
  childSessionId: string,
  state: "completed" | "aborted" | "error",
  diagnostic?: SubagentSettlementDiagnostic,
): Promise<void> {
  const cwd = handle.agent.session.header.cwd;
  if (cwd === undefined) return;
  const settlement = handle.agent.session.append("yishan/subagent-settled.v1", {
    version: 1,
    childSessionId,
    state,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  });
  let cursor = await flushSession({ cwd, sessionId: parentSessionId });
  while (cursor.durableThroughSeq < settlement.seq) {
    cursor = await flushSession({ cwd, sessionId: parentSessionId });
  }
}
