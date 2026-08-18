/**
 * SettingsCommands — the public command surface for the Settings feature.
 *
 * Phase 8 contract, trimmed at desktop7 Phase 23: agent-domain commands moved
 * to the Agent domain (skills, agent definitions, memory config, computer-use
 * permissions). Conformance enforces the surface at typecheck time.
 */
import type * as settingsCommands from "./settingsCommands";

export type SettingsCommands = {
  updateLanguagePreference: typeof settingsCommands.updateLanguagePreference;
  listServiceTokens: typeof settingsCommands.listServiceTokens;
  createServiceToken: typeof settingsCommands.createServiceToken;
  revokeServiceToken: typeof settingsCommands.revokeServiceToken;
  getVoiceUsage: typeof settingsCommands.getVoiceUsage;
  getDaemonLog: typeof settingsCommands.getDaemonLog;
  getDaemonQuitOnExit: typeof settingsCommands.getDaemonQuitOnExit;
  setDaemonQuitOnExit: typeof settingsCommands.setDaemonQuitOnExit;
};
