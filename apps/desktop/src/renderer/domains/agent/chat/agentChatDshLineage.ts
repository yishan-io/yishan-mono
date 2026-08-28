import type { AgentSessionLineageResult } from "../daemon/daemonAgentTypes";
import type { RunningSubagentSummary } from "./agentChatSubagents";

const DSH_ROW_ID_PREFIX = "dsh:";
const DSH_SUBAGENT_FALLBACK_LABEL = "DSH subagent";

/** Projects an authoritative DSH direct-child lineage snapshot into active subagent display rows. */
export function projectDshLineageSubagents(lineage: AgentSessionLineageResult): RunningSubagentSummary[] {
  return lineage.children.flatMap((child) => {
    if (!child.live || child.activity === "inactive" || child.relativeDepth !== 1) {
      return [];
    }

    const label = child.label ?? DSH_SUBAGENT_FALLBACK_LABEL;
    return [
      {
        rowId: `${DSH_ROW_ID_PREFIX}${child.sessionId}`,
        runtime: "dsh",
        agentName: label,
        childSessionId: child.sessionId,
        title: label,
        promptSummary: label,
        state: "running",
      },
    ];
  });
}
