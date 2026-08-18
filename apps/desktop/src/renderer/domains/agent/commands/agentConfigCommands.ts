import type { MemoryConfig } from "../../../rpc/daemonTypes";
import { getDaemonClient } from "../../../rpc/rpcTransport";

/**
 * Agent configuration commands (desktop7 Phase 23).
 *
 * Moved from Settings: memory configuration, agent-model listing for memory
 * settings, and computer-use permissions are Agent-domain behavior. Settings
 * UI consumes them through the Agent public API.
 */

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
