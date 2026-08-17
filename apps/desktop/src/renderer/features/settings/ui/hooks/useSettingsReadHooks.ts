import { useShallow } from "zustand/react/shallow";
import { agentSettingsStore } from "../../state/agentSettingsStore";
import { keybindingSettingsStore } from "../../state/keybindingSettingsStore";
import { workspaceSettingsStore } from "../../state/workspaceSettingsStore";

/**
 * Settings feature read-only hooks — the stable read surface for Settings
 * State (Phase 17, desktop6.md). Cross-feature UI subscribes to settings state
 * through these hooks instead of importing the Settings Stores directly.
 */

/** Subscribes to the git branch prefix settings. */
export function useWorkspaceBranchPrefixSettings() {
  return workspaceSettingsStore(
    useShallow((state) => ({
      prefixMode: state.prefixMode,
      customPrefix: state.customPrefix,
    })),
  );
}

/** Subscribes to which agent kinds are in use. */
export function useAgentKindsInUse() {
  return agentSettingsStore((state) => state.inUseByAgentKind);
}

/** Subscribes to keybinding overrides by command id. */
export function useKeybindingOverrides() {
  return keybindingSettingsStore((state) => state.overridesById);
}
