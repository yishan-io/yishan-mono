import { createShellWorkspaceTabFromOpenInput } from "@/features/shell/state/shell-workspace-tabs";
import type { OpenShellWorkspaceTabInput, ShellWorkspaceTab } from "@/features/shell/state/shell.types";
import { findExistingShellWorkspaceTab } from "./shared";
import type { ShellWorkspaceTabStateSlice } from "./types";

function isTemporaryShellWorkspaceTab(tab: ShellWorkspaceTab): boolean {
  return (tab.kind === "file" || tab.kind === "diff") && tab.data.isTemporary;
}

function findTemporaryShellWorkspaceTabInScope(
  tabs: ShellWorkspaceTab[],
  restrictToTabIds?: string[],
): ShellWorkspaceTab | null {
  const restrictSet = restrictToTabIds ? new Set(restrictToTabIds) : null;
  for (const tab of tabs) {
    if (isTemporaryShellWorkspaceTab(tab)) {
      if (restrictSet && !restrictSet.has(tab.id)) {
        continue;
      }
      return tab;
    }
  }

  return null;
}

function selectShellWorkspaceTab(state: ShellWorkspaceTabStateSlice, tabId: string): ShellWorkspaceTabStateSlice {
  return state.selectedTabId === tabId ? state : { ...state, selectedTabId: tabId };
}

/** Opens or focuses a tab using desktop-aligned workspace+identity rules. */
export function openShellWorkspaceTabState(
  state: ShellWorkspaceTabStateSlice,
  input: OpenShellWorkspaceTabInput,
  nextTabId: string,
  options?: { activePaneTabIds?: string[]; allowTemporaryReuse?: boolean },
): ShellWorkspaceTabStateSlice {
  const targetWorkspaceId = input.workspaceId ?? state.workspaceId;
  if (!targetWorkspaceId) {
    return state;
  }

  const existingTab = findExistingShellWorkspaceTab(state.tabs, input, targetWorkspaceId);
  if (existingTab) {
    return selectShellWorkspaceTab(state, existingTab.id);
  }

  if ((input.kind === "file" || input.kind === "diff") && input.temporary && options?.allowTemporaryReuse !== false) {
    const existingTemporaryTab = findTemporaryShellWorkspaceTabInScope(state.tabs, options?.activePaneTabIds);
    if (existingTemporaryTab) {
      const replacement = createShellWorkspaceTabFromOpenInput(input, targetWorkspaceId, existingTemporaryTab.id);
      return {
        ...state,
        selectedTabId: replacement.id,
        tabs: state.tabs.map((tab) => (tab.id === existingTemporaryTab.id ? replacement : tab)),
      };
    }
  }

  const nextTab = createShellWorkspaceTabFromOpenInput(input, targetWorkspaceId, nextTabId);
  return {
    ...state,
    selectedTabId: nextTab.id,
    tabs: [...state.tabs, nextTab],
  };
}
