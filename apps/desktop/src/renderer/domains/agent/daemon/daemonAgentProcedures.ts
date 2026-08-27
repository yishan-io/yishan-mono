import { subscribeDesktopRpcEvent as subscribeDesktopRpcEventFromTransport } from "@renderer/events/desktopRpcEventBus";
import { request } from "@renderer/rpc";
import { parseAgentAttachResult } from "./daemonAgentAttachParser";
import { parseAgentCancelSubagentResult } from "./daemonAgentCancelSubagentParser";
import { parseAgentHistoryResult } from "./daemonAgentHistoryParser";
import { parseAgentSessionLineageResult } from "./daemonAgentSessionLineageParser";
import type {
  AgentAbortRequest,
  AgentAckResult,
  AgentAttachRequest,
  AgentAttachResult,
  AgentCancelSubagentRequest,
  AgentCancelSubagentResult,
  AgentCapabilities,
  AgentDefinitionCreateInput,
  AgentDefinitionDetail,
  AgentDefinitionInfo,
  AgentDefinitionUpdateInput,
  AgentDisposeRequest,
  AgentHistoryResult,
  AgentListSessionLineageRequest,
  AgentListSessionsRequest,
  AgentPromptRequest,
  AgentReadHistoryRequest,
  AgentRuntime,
  AgentSessionLineageResult,
  AgentSessionsResult,
  AgentStartRequest,
  AgentStartResult,
  ComputerPermissionStatus,
  ComputerUseFeatureConfig,
  MemoryConfig,
  MemoryUpdateConfigInput,
  PiActiveSessionSummary,
  PiExtensionInfo,
  PiListActiveSessionsInput,
  SkillDetail,
  SkillInfo,
} from "./daemonAgentTypes";

/**
 * Agent procedure adapters (desktop7 Phase 25/26). The agent Domain owns its
 * chat / pi / agent / skill / customize / memory / computer namespace
 * procedures over the root transport's path-based invoke. Wire DTOs live in
 * `daemonAgentTypes` (Domain Infrastructure, desktop7 Phase 26); these
 * wrappers are the only agent code that touches transport.
 */

// ─── chat ────────────────────────────────────────────────────────────────────

export async function ensureWorkspaceChatSession(input: {
  workspaceId: string;
  sessionId?: string;
  title?: string;
  agentKind?: string;
}): Promise<unknown> {
  return request("chat.ensureWorkspaceChatSession", input);
}

export async function runWorkspaceChatPrompt(input: {
  workspaceId: string;
  sessionId: string;
  prompt: string;
  agentKind?: string;
  suppressCompletionNotification?: boolean;
}): Promise<unknown> {
  return request("chat.runWorkspaceChatPrompt", input);
}

export async function closeAgentSession(input: { sessionId: string; deleteRecord?: boolean }): Promise<unknown> {
  return request("chat.closeAgentSession", input);
}

// ─── pi ──────────────────────────────────────────────────────────────────────

/**
 * Sends a Pi-specific control command. Use only for runtime-specific controls
 * such as state, messages, models, stats, compact, and extension UI requests.
 * Semantic prompts must use promptAgentSession instead.
 */
export async function sendPiCompatibilityCommand(input: { sessionId: string; command: unknown }): Promise<unknown> {
  return request("pi.send", input);
}

/**
 * Renames a Pi transcript through the legacy Pi-specific RPC namespace.
 * Use only until runtime-neutral session metadata supports renaming.
 */
export async function renamePiCompatibilitySession(input: { sessionId: string; title: string }): Promise<{
  ok: boolean;
}> {
  return (await request("pi.rename", input)) as { ok: boolean };
}

/**
 * Lists live Pi processes through the legacy Pi-specific RPC namespace.
 * Use only where runtime-neutral live-session discovery is unavailable.
 */
export async function listActivePiCompatibilitySessions(
  input?: PiListActiveSessionsInput,
): Promise<PiActiveSessionSummary[]> {
  return (await request("pi.listActiveSessions", input ?? {})) as PiActiveSessionSummary[];
}

export async function listPiProviders(input?: unknown): Promise<{
  providers: Array<{ provider: string; type: string; source?: string; envVars?: string[] }>;
}> {
  return (await request("pi.listProviders", input ?? {})) as {
    providers: Array<{ provider: string; type: string; source?: string; envVars?: string[] }>;
  };
}

export async function savePiProvider(input: {
  provider: string;
  key: string;
  env?: Record<string, string>;
}): Promise<{ ok: boolean }> {
  return (await request("pi.saveProvider", input)) as { ok: boolean };
}

export async function removePiProvider(input: { provider: string }): Promise<{ ok: boolean }> {
  return (await request("pi.removeProvider", input)) as { ok: boolean };
}

// ─── runtime-neutral agent ───────────────────────────────────────────────────

const DSH_TRANSCRIPT_PROTOCOL_VERSION = 2;

/** Gets daemon-owned runtime availability for new top-level agent tabs. */
export async function getAgentCapabilities(): Promise<AgentCapabilities> {
  return parseAgentCapabilities(await request("agent.getCapabilities", {}));
}

function parseAgentCapabilities(payload: unknown): AgentCapabilities {
  if (typeof payload !== "object" || payload === null || !("dsh" in payload)) {
    throw new TypeError("invalid agent capabilities");
  }
  const { dsh } = payload as { dsh: unknown };
  if (typeof dsh !== "object" || dsh === null) throw new TypeError("invalid agent capabilities");
  const { configured, ready, incarnation, transcriptProtocolVersion, provider, model } = dsh as {
    configured: unknown;
    ready: unknown;
    incarnation?: unknown;
    transcriptProtocolVersion?: unknown;
    provider?: unknown;
    model?: unknown;
  };
  if (typeof configured !== "boolean" || typeof ready !== "boolean") {
    throw new TypeError("invalid agent capabilities");
  }
  if (incarnation !== undefined && (typeof incarnation !== "string" || incarnation.trim() === "")) {
    throw new TypeError("invalid DSH runtime incarnation");
  }
  if (transcriptProtocolVersion !== DSH_TRANSCRIPT_PROTOCOL_VERSION) {
    throw new TypeError("unsupported DSH transcript protocol");
  }
  return {
    dsh: {
      configured,
      ready,
      ...(incarnation === undefined ? {} : { incarnation }),
      transcriptProtocolVersion,
      ...(typeof provider === "string" && provider ? { provider } : {}),
      ...(typeof model === "string" && model ? { model } : {}),
    },
  };
}

/** Starts one session in the runtime selected by the request. */
export async function startAgentSession(input: AgentStartRequest): Promise<AgentStartResult> {
  return (await request("agent.start", withDSHTranscriptProtocol(input))) as AgentStartResult;
}

/** Attaches the current daemon connection to one existing agent session. */
export async function attachAgentSession(input: AgentAttachRequest): Promise<AgentAttachResult> {
  return parseAgentAttachResult(await request("agent.attach", withDSHTranscriptProtocol(input)), input);
}

/** Sends one semantic prompt to an agent session. */
export async function promptAgentSession(input: AgentPromptRequest): Promise<AgentAckResult> {
  return (await request("agent.prompt", input)) as AgentAckResult;
}

/** Aborts the current turn while preserving the agent session. */
export async function abortAgentSession(input: AgentAbortRequest): Promise<AgentAckResult> {
  return (await request("agent.abort", input)) as AgentAckResult;
}

/** Disposes an agent session and releases its runtime resources. */
export async function disposeAgentSession(input: AgentDisposeRequest): Promise<AgentAckResult> {
  return (await request("agent.dispose", input)) as AgentAckResult;
}

/** Lists durable agent sessions for one runtime and workspace. */
export async function listAgentRuntimeSessions(input: AgentListSessionsRequest): Promise<AgentSessionsResult> {
  return (await request("agent.listSessions", input)) as AgentSessionsResult;
}

/** Lists native DSH subagents below one open workspace session. */
export async function listAgentSessionLineage(
  input: AgentListSessionLineageRequest,
): Promise<AgentSessionLineageResult> {
  return parseAgentSessionLineageResult(await request("agent.listSessionLineage", input), input);
}

/** Requests interruption of one direct DSH subagent. */
export async function cancelAgentSubagent(input: AgentCancelSubagentRequest): Promise<AgentCancelSubagentResult> {
  return parseAgentCancelSubagentResult(await request("agent.cancelSubagent", input), input);
}

/** Reads durable history without interpreting runtime-specific event payloads. */
export async function readAgentRuntimeHistory(input: AgentReadHistoryRequest): Promise<AgentHistoryResult> {
  return parseAgentHistoryResult(await request("agent.readHistory", withDSHTranscriptProtocol(input)), input);
}

function withDSHTranscriptProtocol<T extends { runtime: AgentRuntime }>(
  input: T,
):
  | T
  | (T & {
      transcriptProtocolVersion: number;
    }) {
  return input.runtime === "dsh" ? { ...input, transcriptProtocolVersion: DSH_TRANSCRIPT_PROTOCOL_VERSION } : input;
}

// ─── agent ───────────────────────────────────────────────────────────────────

export async function listAgentDetectionStatuses(input?: unknown): Promise<unknown> {
  return request("agent.listDetectionStatuses", input ?? {});
}
export async function listAgentModels(input?: { agentKind?: string; forceRefresh?: boolean }): Promise<{
  agentKind: string;
  models: Array<{ id: string; name: string }>;
  source: string;
  fetchedAt: number;
  cacheExpiry: number;
}> {
  return (await request("agent.listModels", input ?? {})) as {
    agentKind: string;
    models: Array<{ id: string; name: string }>;
    source: string;
    fetchedAt: number;
    cacheExpiry: number;
  };
}

// ─── agent global config (external directory permission) ────────────────────

export async function checkAgentGlobalConfigExternalDirectoryPermission(input?: {
  agentKind?: string;
}): Promise<unknown> {
  return request("app.checkAgentGlobalConfigExternalDirectoryPermission", input ?? {});
}

export async function ensureAgentGlobalConfigExternalDirectoryPermission(input?: {
  agentKind?: string;
}): Promise<unknown> {
  return request("app.ensureAgentGlobalConfigExternalDirectoryPermission", input ?? {});
}

export function subscribeDesktopRpcEvent(listener: (event: { method: string; payload?: unknown }) => void): () => void {
  return subscribeDesktopRpcEventFromTransport(listener);
}

// ─── memory ──────────────────────────────────────────────────────────────────

export async function getMemoryConfig(): Promise<MemoryConfig> {
  return (await request("memory.getConfig", {})) as MemoryConfig;
}

export async function updateMemoryConfig(config: MemoryUpdateConfigInput): Promise<{ ok: boolean }> {
  return (await request("memory.updateConfig", config)) as { ok: boolean };
}

// ─── computer ────────────────────────────────────────────────────────────────

export async function getComputerUsePermissions(): Promise<ComputerPermissionStatus> {
  return (await request("computer.permissions", {})) as ComputerPermissionStatus;
}

export async function openComputerUsePermissionSettings(input: {
  permission: string;
}): Promise<{ ok: boolean }> {
  return (await request("computer.openPermissionSettings", input)) as { ok: boolean };
}

export async function getComputerUseConfig(): Promise<ComputerUseFeatureConfig> {
  return (await request("computer.getConfig", {})) as ComputerUseFeatureConfig;
}

export async function updateComputerUseConfig(config: ComputerUseFeatureConfig): Promise<{ ok: boolean }> {
  return (await request("computer.updateConfig", config)) as { ok: boolean };
}

// ─── skill ───────────────────────────────────────────────────────────────────

export async function listAgentSkills(): Promise<{ skills: SkillInfo[] }> {
  return (await request("skill.list", {})) as { skills: SkillInfo[] };
}

export async function getAgentSkillDetail(input: { name: string }): Promise<SkillDetail> {
  return (await request("skill.detail", input)) as SkillDetail;
}

export async function addAgentSkill(input: { source: string }): Promise<{ added: boolean }> {
  return (await request("skill.add", input)) as { added: boolean };
}

export async function removeAgentSkill(input: { name: string }): Promise<{ removed: boolean }> {
  return (await request("skill.remove", input)) as { removed: boolean };
}

export async function updateAgentSkill(input: { name: string }): Promise<{ updated: boolean }> {
  return (await request("skill.update", input)) as { updated: boolean };
}

export async function updateAllAgentSkills(): Promise<{ updated: boolean }> {
  return (await request("skill.updateAll", {})) as { updated: boolean };
}

export async function listAvailableAgentTools(): Promise<{ tools: string[] }> {
  return (await request("customize.tools.list", {})) as { tools: string[] };
}

// ─── customize: extensions ───────────────────────────────────────────────────

export async function listPiExtensions(): Promise<{ extensions: PiExtensionInfo[] }> {
  return (await request("customize.extensions.list", {})) as { extensions: PiExtensionInfo[] };
}

export async function installPiExtension(input: { source: string }): Promise<{ installed: boolean }> {
  return (await request("customize.extensions.install", input)) as { installed: boolean };
}

export async function removePiExtension(input: { source: string }): Promise<{ removed: boolean }> {
  return (await request("customize.extensions.remove", input)) as { removed: boolean };
}

export async function updatePiExtension(input: { source: string }): Promise<{ updated: boolean }> {
  return (await request("customize.extensions.update", input)) as { updated: boolean };
}

// ─── customize: agent definitions ────────────────────────────────────────────

export async function listAgentDefinitions(): Promise<{ agents: AgentDefinitionInfo[] }> {
  return (await request("customize.agents.list", {})) as { agents: AgentDefinitionInfo[] };
}

export async function getAgentDefinitionDetail(input: { name: string }): Promise<AgentDefinitionDetail> {
  return (await request("customize.agents.detail", input)) as AgentDefinitionDetail;
}

export async function createAgentDefinition(input: AgentDefinitionCreateInput): Promise<{ created: boolean }> {
  return (await request("customize.agents.create", input)) as { created: boolean };
}

export async function updateAgentDefinition(input: AgentDefinitionUpdateInput): Promise<{ updated: boolean }> {
  return (await request("customize.agents.update", input)) as { updated: boolean };
}

export async function removeAgentDefinition(input: { name: string }): Promise<{ removed: boolean }> {
  return (await request("customize.agents.remove", input)) as { removed: boolean };
}

export async function restoreAgentDefinition(input: { name: string }): Promise<{ restored: boolean }> {
  return (await request("customize.agents.restore", input)) as { restored: boolean };
}
