import { getVoiceTranscriptionUsage } from "@renderer/domains/agent";
import { updateLanguagePreference as updateLanguagePreferenceFromApi } from "@renderer/domains/session";
import { getDesktopHostBridge } from "@renderer/platform/hostBridge";
import type { DaemonLogResult } from "../../../../main/bridge/daemon";
import {
  createServiceToken as createServiceTokenFromApi,
  listServiceTokens as listServiceTokensFromApi,
  revokeServiceToken as revokeServiceTokenFromApi,
} from "../api/serviceTokenApi";
import { getDaemonQuitOnExit, setDaemonQuitOnExit } from "../host/daemonHost";
import { type AgentChatWidth, displaySettingsStore } from "../state/displaySettingsStore";

/**
 * SettingsCommands — the public command surface for the Settings feature.
 *
 * Phase 8 contract, trimmed at desktop7 Phase 23: agent-domain commands
 * (memory config, computer-use permissions, agent models, skills, agent
 * definitions) moved to the Agent domain. Settings keeps language, service
 * tokens, voice usage, and daemon log wrappers.
 */

/** Updates the app language preference. */
export function updateLanguagePreference(language: Parameters<typeof updateLanguagePreferenceFromApi>[0]) {
  return updateLanguagePreferenceFromApi(language);
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
export type { DaemonLogResult } from "../../../../main/bridge/daemon";

/** Updates the preferred agent chat content width. */
export function setAgentChatWidth(width: AgentChatWidth): void {
  displaySettingsStore.getState().setAgentChatWidth(width);
}
