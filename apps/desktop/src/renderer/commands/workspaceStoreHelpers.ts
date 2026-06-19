import type { WorkspaceStoreState } from "../store/types";
import { workspaceStore } from "../store/workspaceStore";

type WorkspaceStoreFacade = typeof workspaceStore & {
  getState?: () => WorkspaceStoreState;
};

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
