import { type DesktopAgentKind, SUPPORTED_DESKTOP_AGENT_KINDS, isDesktopAgentKind } from "../helpers/agentSettings";
import { getDaemonClient } from "../rpc/rpcTransport";

export type AgentDetectionStatus = {
  agentKind: DesktopAgentKind;
  detected: boolean;
  version?: string;
};

export type AgentModelInfo = {
  id: string;
  name: string;
};

export type AgentModelsResult = {
  agentKind: string;
  models: AgentModelInfo[];
  source: string;
  fetchedAt: number;
  cacheExpiry: number;
};

/**
 * Normalizes one unknown API payload into ordered desktop agent detection statuses.
 */
function normalizeAgentDetectionStatuses(payload: unknown): AgentDetectionStatus[] {
  const detectedByAgentKind = new Map<DesktopAgentKind, boolean>();
  const versionByAgentKind = new Map<DesktopAgentKind, string>();
  const unsupportedAgentKinds = new Set<string>();

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as { agentKind?: unknown; detected?: unknown; version?: unknown };
      const rawAgentKind = typeof record.agentKind === "string" ? record.agentKind.trim() : "";
      if (!isDesktopAgentKind(rawAgentKind)) {
        if (rawAgentKind.length > 0) {
          unsupportedAgentKinds.add(rawAgentKind);
        }
        continue;
      }

      detectedByAgentKind.set(rawAgentKind, Boolean(record.detected));
      if (typeof record.version === "string" && record.version.trim().length > 0) {
        versionByAgentKind.set(rawAgentKind, record.version.trim());
      }
    }
  }

  if (unsupportedAgentKinds.size > 0) {
    console.info(
      `[agentCommands] Ignoring unsupported detected CLI tools: ${Array.from(unsupportedAgentKinds).sort().join(", ")}`,
    );
  }

  return SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => ({
    agentKind,
    detected: detectedByAgentKind.get(agentKind) ?? false,
    version: versionByAgentKind.get(agentKind),
  }));
}

/** Lists supported desktop agents with current system detection state. */
export async function listAgentDetectionStatuses(forceRefresh = false): Promise<AgentDetectionStatus[]> {
  const client = await getDaemonClient();
  const payload = await client.agent.listDetectionStatuses(forceRefresh ? { refresh: true } : undefined);
  return normalizeAgentDetectionStatuses(payload);
}

/** Fetches available models for one agent kind from the daemon cache. */
export async function listAgentModels(
  agentKind: string,
  forceRefresh = false,
): Promise<AgentModelsResult> {
  const client = await getDaemonClient();
  return (await client.agent.listModels({ agentKind, forceRefresh })) as AgentModelsResult;
}
