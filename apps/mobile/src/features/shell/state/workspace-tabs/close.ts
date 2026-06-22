import type { ShellWorkspaceTabStateSlice } from "./types";

/** Closes one tab and keeps the nearest sibling focused, matching desktop selection behavior. */
export function closeShellWorkspaceTabState(
  state: ShellWorkspaceTabStateSlice,
  tabId: string,
): ShellWorkspaceTabStateSlice {
  const currentIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  if (currentIndex === -1) {
    return state;
  }

  const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
  const nextSelectedTabId =
    state.selectedTabId !== tabId
      ? state.selectedTabId
      : ((nextTabs[currentIndex] ?? nextTabs[currentIndex - 1] ?? null)?.id ?? "");

  return {
    ...state,
    selectedTabId: nextSelectedTabId,
    tabs: nextTabs,
  };
}
