import { workspaceSettingsStore } from "./workspaceSettingsStore";

/**
 * Workspace settings selectors (desktop7 Phase 23).
 *
 * Moved from Settings: "new workspaces default to context-enabled" is a
 * Workspace-domain preference.
 */

/** Reads whether new workspaces default to context-enabled. */
export function selectIsDefaultContextEnabled(): boolean {
  return workspaceSettingsStore.getState().isDefaultContextEnabled;
}
