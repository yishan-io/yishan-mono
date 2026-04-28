import { type DesktopAgentKind, SUPPORTED_DESKTOP_AGENT_KINDS, isDesktopAgentKind } from "../helpers/agentSettings";
import { getDaemonClient } from "../rpc/rpcTransport";

export type AgentDetectionStatus = {
  agentKind: DesktopAgentKind;
  detected: boolean;
  version?: string;
};

/**
 * Normalizes one unknown API payload into ordered desktop agent detection statuses.
 */
function normalizeAgentDetectionStatuses(payload: unknown): AgentDetectionStatus[] {
  const detectedByAgentKind = new Map<DesktopAgentKind, boolean>();
  const versionByAgentKind = new Map<DesktopAgentKind, string>();

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as { agentKind?: unknown; detected?: unknown; version?: unknown };
      const rawAgentKind = typeof record.agentKind === "string" ? record.agentKind.trim() : "";
      if (!isDesktopAgentKind(rawAgentKind)) {
        continue;
      }

      detectedByAgentKind.set(rawAgentKind, Boolean(record.detected));
      if (typeof record.version === "string" && record.version.trim().length > 0) {
        versionByAgentKind.set(rawAgentKind, record.version.trim());
      }
    }
  }

  return SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => ({
    agentKind,
    detected: detectedByAgentKind.get(agentKind) ?? false,
    version: versionByAgentKind.get(agentKind),
  }));
}

/** Lists supported desktop agents with current system detection state. */
export async function listAgentDetectionStatuses(): Promise<AgentDetectionStatus[]> {
  const client = await getDaemonClient();
  const payload = await client.agent.listDetectionStatuses(undefined);
  return normalizeAgentDetectionStatuses(payload);
}
