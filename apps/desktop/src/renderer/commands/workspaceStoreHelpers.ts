import type { WorkspaceStoreState } from "../store/types";
import { workspaceStore } from "../store/workspaceStore";

type WorkspaceStoreFacade = typeof workspaceStore & {
  getState?: () => WorkspaceStoreState;
};

export type WorkspaceCreatePlaceholderInput = Parameters<WorkspaceStoreState["addWorkspace"]>[0];

/** Reads workspace store state for both real Zustand stores and selector-only test doubles. */
export function readWorkspaceStoreState(): WorkspaceStoreState {
  const facade = workspaceStore as WorkspaceStoreFacade;
  if (typeof facade.getState === "function") {
    return facade.getState();
  }

  return (
    workspaceStore as unknown as (selector: (state: WorkspaceStoreState) => WorkspaceStoreState) => WorkspaceStoreState
  )((state) => state);
}

/** Builds one optimistic workspace row payload shared by UI create and backend create-start flows. */
export function buildWorkspaceCreatePlaceholder(
  input: WorkspaceCreatePlaceholderInput,
): WorkspaceCreatePlaceholderInput {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    repoId: input.repoId ?? input.projectId,
    name: input.name,
    sourceBranch: input.sourceBranch,
    branch: input.branch,
    worktreePath: input.worktreePath ?? "",
    nodeId: input.nodeId,
    workspaceId: input.workspaceId,
    status: input.status,
  };
}
