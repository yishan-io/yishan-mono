import {
  checkAgentGlobalConfigExternalDirectoryPermission as checkAgentGlobalConfigExternalDirectoryPermissionProcedure,
  ensureAgentGlobalConfigExternalDirectoryPermission as ensureAgentGlobalConfigExternalDirectoryPermissionProcedure,
  getMemoryConfig as getMemoryConfigProcedure,
  listAgentModels,
  updateMemoryConfig as updateMemoryConfigProcedure,
} from "../daemon/daemonAgentProcedures";
import type { MemoryConfig } from "../daemon/daemonAgentTypes";

/**
 * Agent configuration commands (desktop7 Phase 23/26).
 *
 * Moved from Settings: memory configuration, agent-model listing for memory
 * settings are Agent-domain behavior. Settings
 * UI consumes them through the Agent public API. RPC access goes through the
 * Agent Infrastructure procedure adapters (Phase 26).
 */

/** Reads the memory configuration from the daemon. */
export function getMemoryConfig() {
  return getMemoryConfigProcedure();
}

/** Updates the memory configuration on the daemon. */
export function updateMemoryConfig(config: MemoryConfig) {
  return updateMemoryConfigProcedure(config);
}

/** Lists agent models for the memory settings view. */
export function listAgentModelsForMemorySettings(input?: { agentKind?: string; forceRefresh?: boolean }) {
  return listAgentModels(input);
}

/** Checks whether one agent global config grants external directory access. */
export function checkAgentGlobalConfigExternalDirectoryPermission(params?: { agentKind?: string }) {
  return checkAgentGlobalConfigExternalDirectoryPermissionProcedure(params ?? {});
}

/** Ensures one agent global config grants external directory access. */
export function ensureAgentGlobalConfigExternalDirectoryPermission(params?: { agentKind?: string }) {
  return ensureAgentGlobalConfigExternalDirectoryPermissionProcedure(params ?? {});
}
