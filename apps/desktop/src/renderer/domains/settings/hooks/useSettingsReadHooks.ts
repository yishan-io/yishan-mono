import { keybindingSettingsStore } from "../state/keybindingSettingsStore";

/**
 * Settings feature read-only hooks — the stable read surface for Settings
 * State (Phase 17, desktop6.md). Cross-feature UI subscribes to settings state
 * through these hooks instead of importing the Settings Stores directly.
 */

/** Subscribes to keybinding overrides by command id. */
export function useKeybindingOverrides() {
  return keybindingSettingsStore((state) => state.overridesById);
}
