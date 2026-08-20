import { subscribeDesktopRpcEvent as subscribeDesktopRpcEventFromTransport } from "@renderer/events/desktopRpcEventBus";
import { request } from "@renderer/rpc";
import type {
  AgentDefinitionCreateInput,
  AgentDefinitionDetail,
  AgentDefinitionInfo,
  AgentDefinitionUpdateInput,
  ComputerPermissionStatus,
  ComputerUseFeatureConfig,
  MemoryConfig,
  MemoryUpdateConfigInput,
  PiActiveSessionSummary,
  PiExtensionInfo,
  PiGetSessionFileInput,
  PiGetSessionFileResult,
  PiListActiveSessionsInput,
  PiListSessionsInput,
  PiSessionSummary,
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

export async function startPiSession(input: {
  sessionId: string;
  tabId: string;
  paneId?: string;
  workspaceId: string;
  cwd: string;
  resume?: boolean;
}): Promise<{ sessionId: string }> {
  return (await request("pi.start", input)) as { sessionId: string };
}

export async function attachPiSession(input: {
  sessionId: string;
  tabId?: string;
  workspaceId?: string;
  cwd?: string;
}): Promise<{ ok: boolean }> {
  return (await request("pi.attach", input)) as { ok: boolean };
}

export async function stopPiSession(input: { sessionId: string }): Promise<{ ok: boolean }> {
  return (await request("pi.stop", input)) as { ok: boolean };
}

export async function sendPiCommand(input: { sessionId: string; command: unknown }): Promise<unknown> {
  return request("pi.send", input);
}

export async function renamePiSession(input: { sessionId: string; title: string }): Promise<{ ok: boolean }> {
  return (await request("pi.rename", input)) as { ok: boolean };
}

export async function listPiSessions(input?: PiListSessionsInput): Promise<PiSessionSummary[]> {
  return (await request("pi.listSessions", input ?? {})) as PiSessionSummary[];
}

export async function getPiSessionFile(input: PiGetSessionFileInput): Promise<PiGetSessionFileResult> {
  return (await request("pi.getSessionFile", input)) as PiGetSessionFileResult;
}

export async function listActivePiSessions(input?: PiListActiveSessionsInput): Promise<PiActiveSessionSummary[]> {
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
