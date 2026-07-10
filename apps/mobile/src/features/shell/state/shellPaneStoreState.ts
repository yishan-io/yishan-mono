import { normalizePaneLayoutState } from "@/features/shell/state/shell-pane-layout-helpers";
import { sanitizeWorkspacePaneStoreState } from "@/features/shell/state/shell-pane-state-machine";
import { createEmptyWorkspacePaneStoreState } from "@/features/shell/state/shell-state-helpers";
import type {
  ShellWorkspaceTabState,
  WorkspacePaneLayoutState,
  WorkspacePaneStoreState,
} from "@/features/shell/state/shell.types";
import { workspacePaneLayoutsEqual, workspaceTabStatesEqual } from "@/features/shell/state/shellPaneStoreEquality";

export type PaneStoreStateStorage = {
  hasRestoredStoredState: boolean;
  paneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  setPaneLayoutByWorkspaceId: (
    updater: (current: Record<string, WorkspacePaneLayoutState>) => Record<string, WorkspacePaneLayoutState>,
  ) => void;
  setWorkspaceTabStateByWorkspaceId: (
    updater: (current: Record<string, ShellWorkspaceTabState>) => Record<string, ShellWorkspaceTabState>,
  ) => void;
  workspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
};

export const DETACHED_WORKSPACE_ID = "__detached__";

export function getStoredWorkspacePaneStoreState(
  storedState: PaneStoreStateStorage,
  workspaceId: string,
): WorkspacePaneStoreState | null {
  const tabState = storedState.workspaceTabStateByWorkspaceId[workspaceId];
  const layoutState = storedState.paneLayoutByWorkspaceId[workspaceId];
  if (!tabState && !layoutState) {
    return null;
  }

  const fallbackStoreState = createEmptyWorkspacePaneStoreState(workspaceId);
  const resolvedTabState = tabState ?? fallbackStoreState.tabState;
  return {
    layoutState: normalizePaneLayoutState(resolvedTabState, layoutState ?? fallbackStoreState.layoutState),
    tabState: resolvedTabState,
  };
}

export function restoreWorkspacePaneStoreState(input: {
  cachedStoreState?: WorkspacePaneStoreState | null;
  storedStoreState?: WorkspacePaneStoreState | null;
  workspaceId: string;
}): WorkspacePaneStoreState {
  const baseStoreState =
    input.cachedStoreState ?? input.storedStoreState ?? createEmptyWorkspacePaneStoreState(input.workspaceId);
  return sanitizeWorkspacePaneStoreState(baseStoreState, input.workspaceId);
}

export function resolveEffectiveWorkspacePaneStoreState(input: {
  currentWorkspaceId: string | null;
  getWorkspacePaneStoreState: (workspaceId: string) => WorkspacePaneStoreState;
  hydratedWorkspaceId: string | null;
  runtimeWorkspacePaneStoreState: WorkspacePaneStoreState;
}): WorkspacePaneStoreState {
  if (!input.currentWorkspaceId) {
    return input.runtimeWorkspacePaneStoreState;
  }

  if (
    input.hydratedWorkspaceId === input.currentWorkspaceId &&
    input.runtimeWorkspacePaneStoreState.tabState.workspaceId === input.currentWorkspaceId
  ) {
    return input.runtimeWorkspacePaneStoreState;
  }

  return input.getWorkspacePaneStoreState(input.currentWorkspaceId);
}

export function writeWorkspacePaneStoreStorage(input: {
  currentWorkspaceId: string | null;
  nextStoreState: WorkspacePaneStoreState;
  setHydratedWorkspaceId: (updater: (current: string | null) => string | null) => void;
  setPaneLayoutByWorkspaceId: PaneStoreStateStorage["setPaneLayoutByWorkspaceId"];
  setWorkspacePaneStoreState: (nextStoreState: WorkspacePaneStoreState) => void;
  setWorkspaceTabStateByWorkspaceId: PaneStoreStateStorage["setWorkspaceTabStateByWorkspaceId"];
  workspaceId: string;
}) {
  if (input.currentWorkspaceId === input.workspaceId) {
    input.setWorkspacePaneStoreState(input.nextStoreState);
    input.setHydratedWorkspaceId((current) => (current === input.workspaceId ? current : input.workspaceId));
  }
  input.setWorkspaceTabStateByWorkspaceId((current) => {
    const existing = current[input.workspaceId];
    if (existing && workspaceTabStatesEqual(existing, input.nextStoreState.tabState)) {
      return current;
    }
    return { ...current, [input.workspaceId]: input.nextStoreState.tabState };
  });
  input.setPaneLayoutByWorkspaceId((current) => {
    const existing = current[input.workspaceId];
    const nextLayoutState = input.nextStoreState.layoutState;
    if (existing && workspacePaneLayoutsEqual(existing, nextLayoutState)) {
      return current;
    }
    return { ...current, [input.workspaceId]: nextLayoutState };
  });
}
