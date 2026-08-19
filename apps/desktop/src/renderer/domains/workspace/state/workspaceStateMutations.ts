import { workspaceStore } from "./workspaceStore";
import type { WorkspaceStoreState } from "./workspaceStoreTypes";

/**
 * Workspace semantic State mutations (desktop8 Phase 33). Each function is
 * the authoritative public State operation for Workspace data; the raw
 * Workspace Store stays internal to the Domain.
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
