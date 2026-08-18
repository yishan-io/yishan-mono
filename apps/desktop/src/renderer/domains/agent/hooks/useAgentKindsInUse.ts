import { agentSettingsStore } from "../state/agentSettingsStore";

/**
 * Subscribes to the desktop agent in-use map owned by the Agent domain.
 *
 * Moved from Settings (desktop7 Phase 21): the Settings public index must not
 * evaluate the Agent index at module-load time (Agent features import the
 * Settings index back; a settings→agent eval-time edge re-entered the mocked
 * module graphs of Files/Workspace tests). Agent enablement is Agent-domain
 * configuration; Settings UI consumes it through this public hook.
 */
export function useAgentKindsInUse() {
  return agentSettingsStore((state) => state.inUseByAgentKind);
}
