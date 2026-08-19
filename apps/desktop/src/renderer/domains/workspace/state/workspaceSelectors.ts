import { workspaceStore } from "./workspaceStore";
import { workbenchNavigationStore } from "@renderer/domains/workbench";

/**
 * Workspace feature selectors — the public read surface for Workspace State
 * (Phase 12, desktop5.md). Cross-feature code reads workspace state through
 * these functions instead of importing the Workspace Store directly.
 *
 * Active Workspace/Project context lives in the Workbench navigation Store
 * (desktop6-adjust.md W2); callers read `workbenchNavigationStore` directly.
 */
/** Reads the full workspace list. */
export function selectWorkspaces() {
  return workspaceStore.getState().workspaces;
}
