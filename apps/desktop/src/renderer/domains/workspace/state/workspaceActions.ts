import { workspaceStore } from "./workspaceStore";
import type { WorkspaceStoreState } from "./workspaceStoreTypes";

/**
 * Workspace feature state actions — the public state-change surface for
 * Workspace State (Phase 12, desktop5.md). Cross-feature commands apply
 * workspace state changes through these functions instead of importing the
 * Workspace Store directly.
 */
type AddWorkspaceInput = Parameters<WorkspaceStoreState["addWorkspace"]>[0];

/** Adds one workspace record. */
export function addWorkspace(input: AddWorkspaceInput): void {
  workspaceStore.getState().addWorkspace(input);
}

/** Reorders the workspace display ids. */
export function setOrderedWorkspaceIds(workspaceIds: string[]): void {
  workspaceStore.getState().setOrderedWorkspaceIds(workspaceIds);
}

// Workspace lifecycle notices are display-state: cross-feature code enqueues
// them through this public surface instead of importing the notice store.
export { enqueueWorkspaceErrorNotice } from "./workspaceLifecycleNoticeStore";
