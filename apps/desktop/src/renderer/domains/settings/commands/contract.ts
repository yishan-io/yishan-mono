/**
 * SettingsCommands — the public command surface for the Settings feature.
 *
 * Phase 8 contract. Owned by `features/settings/commands/settingsCommands.ts`
 * (+ skillCommands + customizeCommands in the same dir); conformance enforces
 * the surface at typecheck time.
 */
import type * as settingsCommands from "./settingsCommands";

export type SettingsCommands = {
  updateLanguagePreference: typeof settingsCommands.updateLanguagePreference;
  getMemoryConfig: typeof settingsCommands.getMemoryConfig;
  updateMemoryConfig: typeof settingsCommands.updateMemoryConfig;
  listAgentModelsForMemorySettings: typeof settingsCommands.listAgentModelsForMemorySettings;
  getComputerUsePermissions: typeof settingsCommands.getComputerUsePermissions;
  openComputerUsePermissionSettings: typeof settingsCommands.openComputerUsePermissionSettings;
  listServiceTokens: typeof settingsCommands.listServiceTokens;
  createServiceToken: typeof settingsCommands.createServiceToken;
  revokeServiceToken: typeof settingsCommands.revokeServiceToken;
  getVoiceUsage: typeof settingsCommands.getVoiceUsage;
  getDaemonLog: typeof settingsCommands.getDaemonLog;
  getDaemonQuitOnExit: typeof settingsCommands.getDaemonQuitOnExit;
  setDaemonQuitOnExit: typeof settingsCommands.setDaemonQuitOnExit;
};
