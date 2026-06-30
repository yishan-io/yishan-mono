import type { ShellWorkspaceTabStateSlice } from "./types";

export function selectShellWorkspaceTabState(
  state: ShellWorkspaceTabStateSlice,
  tabId: string,
): ShellWorkspaceTabStateSlice {
  if (state.selectedTabId === tabId || !state.tabs.some((tab) => tab.id === tabId)) {
    return state;
  }

  return {
    ...state,
    selectedTabId: tabId,
  };
}
