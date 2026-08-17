import { workspaceSettingsStore } from "./workspaceSettingsStore";

/**
 * Settings feature selectors — the public read surface for Settings State
 * (Phase 17, desktop6.md). Cross-feature code reads settings state through
 * these functions instead of importing the Settings Stores directly.
 */

/** Reads whether new workspaces default to context-enabled. */
export function selectIsDefaultContextEnabled(): boolean {
  return workspaceSettingsStore.getState().isDefaultContextEnabled;
}
