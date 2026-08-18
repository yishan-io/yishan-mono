/**
 * SettingsCommands — the public command surface for the Settings feature.
 *
 * Phase 8 contract. Owns settings-specific wrappers (language, memory,
 * computer-use, service tokens, voice usage, daemon log) and re-exports the
 * skill + customize catalog surfaces. Org/node/app/daemon commands are imported
 * directly by views from their own command modules (no re-export bucket).
 */
import { updateLanguagePreference as updateLanguagePreferenceFromApi } from "../../../api/sessionApi";
import {
  createServiceToken as createServiceTokenFromApi,
  listServiceTokens as listServiceTokensFromApi,
  revokeServiceToken as revokeServiceTokenFromApi,
} from "../../../api/serviceTokenApi";
import { getVoiceTranscriptionUsage } from "../../../api/voiceTranscriptionApi";
import type { MemoryConfig } from "../../../rpc/daemonTypes";
import { getDaemonClient, getDesktopHostBridge } from "../../../rpc/rpcTransport";
import type { DaemonLogResult } from "../../../../main/ipc";
import { getDaemonQuitOnExit, setDaemonQuitOnExit } from "../../../app/commands/appCommands";
import {
  addSkill,
  getSkillDetail,
  listSkills,
  removeSkill,
  updateSkill,
} from "./skillCommands";
import {
  createAgentDefinition,
  getAgentDefinitionDetail,
  installExtension,
  listAgentDefinitions,
  listExtensions,
  removeAgentDefinition,
  removeExtension,
  restoreAgentDefinition,
  updateAgentDefinition,
  updateExtension,
} from "./customizeCommands";

/** Updates the app language preference. */
export function updateLanguagePreference(language: Parameters<typeof updateLanguagePreferenceFromApi>[0]) {
  return updateLanguagePreferenceFromApi(language);
}

/** Reads the memory configuration from the daemon. */
export async function getMemoryConfig() {
  const client = await getDaemonClient();
  return client.memory.getConfig();
}

/** Updates the memory configuration on the daemon. */
export async function updateMemoryConfig(config: MemoryConfig) {
  const client = await getDaemonClient();
  return client.memory.updateConfig(config);
}

/** Lists agent models for the memory settings view. */
export async function listAgentModelsForMemorySettings(input?: { agentKind?: string; forceRefresh?: boolean }) {
  const client = await getDaemonClient();
  return client.agent.listModels(input);
}

/** Reads computer-use permission state from the daemon. */
export async function getComputerUsePermissions() {
  const client = await getDaemonClient();
  return client.computer.permissions();
}

/** Opens the computer-use permission settings for one permission. */
export async function openComputerUsePermissionSettings(
  permission: "accessibility" | "screenRecording" | "camera" | "fullDiskAccess" | "localNetwork" | "bluetooth",
) {
  const client = await getDaemonClient();
  return client.computer.openPermissionSettings({ permission });
}

/** Lists service tokens. */
export function listServiceTokens() {
  return listServiceTokensFromApi();
}

/** Creates one service token. */
export function createServiceToken(input: Parameters<typeof createServiceTokenFromApi>[0]) {
  return createServiceTokenFromApi(input);
}

/** Revokes one service token. */
export function revokeServiceToken(tokenId: string) {
  return revokeServiceTokenFromApi(tokenId);
}

/** Reads voice transcription usage for one org. */
export function getVoiceUsage(orgId: string) {
  return getVoiceTranscriptionUsage(orgId);
}

/** Reads the daemon log from the Electron host. */
export async function getDaemonLog(): Promise<DaemonLogResult> {
  return getDesktopHostBridge().readDaemonLog();
}

export { getDaemonQuitOnExit, setDaemonQuitOnExit };
export type { DaemonLogResult } from "../../../../main/ipc";

export {
  addSkill,
  getSkillDetail,
  listSkills,
  removeSkill,
  updateSkill,
  createAgentDefinition,
  getAgentDefinitionDetail,
  installExtension,
  listAgentDefinitions,
  listExtensions,
  removeAgentDefinition,
  removeExtension,
  restoreAgentDefinition,
  updateAgentDefinition,
  updateExtension,
};
