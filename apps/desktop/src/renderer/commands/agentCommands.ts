import { type DesktopAgentKind, SUPPORTED_DESKTOP_AGENT_KINDS, isDesktopAgentKind } from "../helpers/agentSettings";
import { getDaemonRpcClient } from "../rpc/rpcTransport";

export type AgentDetectionStatus = {
  agentKind: DesktopAgentKind;
  detected: boolean;
};

/**
 * Normalizes one unknown API payload into ordered desktop agent detection statuses.
 */
function normalizeAgentDetectionStatuses(payload: unknown): AgentDetectionStatus[] {
  const detectedByAgentKind = new Map<DesktopAgentKind, boolean>();

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as { agentKind?: unknown; detected?: unknown };
      const rawAgentKind = typeof record.agentKind === "string" ? record.agentKind.trim() : "";
      if (!isDesktopAgentKind(rawAgentKind)) {
        continue;
      }

      detectedByAgentKind.set(rawAgentKind, Boolean(record.detected));
    }
  }

  return SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => ({
    agentKind,
    detected: detectedByAgentKind.get(agentKind) ?? false,
  }));
}

/** Lists supported desktop agents with current system detection state. */
export async function listAgentDetectionStatuses(): Promise<AgentDetectionStatus[]> {
  const client = await getDaemonRpcClient();
  const payload = await client.agent.listDetectionStatuses(undefined);
  return normalizeAgentDetectionStatuses(payload);
}
