import type { DesktopAgentKind } from "@renderer/domains/agent";
import { generateId } from "@shared/ids/generateId";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { OpenTabInput, WorkbenchTab } from "../types";
import { resolveSelectedTabIdForWorkspace } from "../tabs";
import {
  closeAllTabsState,
  closeAllTerminalTabsState,
  closeOtherTabsState,
  closeTabState,
  openTabState,
  promoteTemporaryTabState,
  renameTabState,
  renameTabsForEntryRenameState,
  reorderTabState,
  setFileTabDirtyState,
  toggleTabPinnedState,
} from "../tabs/index";

export type CloseTabOptions = {
  /** Tab to select when the closed tab was the selected one (e.g. the remaining pane's selection). */
  preferredSelectedTabId?: string;
};

export type TabStoreState = {
  tabs: WorkbenchTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
  /** Returns workspace tabs sorted with pinned entries first. */
  getWorkspaceTabs: (workspaceId: string) => WorkbenchTab[];
  /** Resolves and applies the correct selectedTabId for the given workspace. */
  resolveTabForWorkspace: (workspaceId: string) => void;
  selectTab: (tabId: string) => void;
  retainWorkspaceTabs: (workspaceIds: string[], activeWorkspaceId: string) => string[];
  openTab: (input: OpenTabInput, options: { workspaceId: string; activePaneTabIds?: string[] }) => void;
  closeTab: (tabId: string, options?: CloseTabOptions) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: (tabId: string) => void;
  /** Closes every terminal tab across all workspaces (used before daemon restart). */
  closeAllTerminalTabs: (workspaceId: string) => void;
  /** Persists one backend terminal session id on one terminal tab. */
  setTerminalTabSessionId: (tabId: string, sessionId: string) => void;
  /** Persists the single agent-chat session identity on one tab. */
  setAgentChatTabSession: (input: { tabId: string; sessionId: string }) => void;
  /** Persists subagent-control metadata on one agent-chat tab. */
  setAgentChatTabSubagentControl: (input: { tabId: string; agentId?: string; parentSessionId?: string }) => void;
  /** Updates the detected agent kind on one terminal tab. Pass undefined to clear. */
  setTerminalTabAgentKind: (tabId: string, agentKind: DesktopAgentKind | undefined) => void;
  setBrowserTabFaviconUrl: (tabId: string, faviconUrl: string | undefined) => void;
  /** Persists the current navigated URL on a browser tab so it survives unmount/remount cycles. */
  setBrowserTabUrl: (tabId: string, url: string) => void;
  toggleTabPinned: (tabId: string) => void;
  promoteTemporaryTab: (tabId: string) => void;
  reorderTab: (draggedTabId: string, targetTabId: string, position: "before" | "after") => void;
  renameTab: (tabId: string, title: string, options?: { userRenamed?: boolean }) => void;
  renameTabsForEntryRename: (workspaceId: string, fromPath: string, toPath: string) => void;
  /** Syncs the dirty presentation flag on one file tab (content lives in Files state). */
  setFileTabDirty: (tabId: string, isDirty: boolean) => void;
};

/** Creates a client-only tab id for local UI tab lifecycle. */
function createClientTabId(): string {
  return generateId();
}

/** Stores all tab state and tab actions. */
export const tabStore = create<TabStoreState>()(
  immer((set, get) => {
    return {
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
      getWorkspaceTabs: (workspaceId) => {
        return get()
          .tabs.filter((tab: WorkbenchTab) => tab.workspaceId === workspaceId)
          .sort((leftTab: WorkbenchTab, rightTab: WorkbenchTab) => {
            if (leftTab.pinned === rightTab.pinned) {
              return 0;
            }
            return leftTab.pinned ? -1 : 1;
          });
      },
      resolveTabForWorkspace: (workspaceId) => {
        set((state) => ({
          selectedTabId: resolveSelectedTabIdForWorkspace({
            workspaceId,
            tabs: state.tabs ?? [],
            selectedTabIdByWorkspaceId: state.selectedTabIdByWorkspaceId ?? {},
          }),
        }));
      },
      selectTab: (tabId) => {
        set((state) => {
          const tabs = state.tabs ?? [];
          const selectedTabIdByWorkspaceId = state.selectedTabIdByWorkspaceId ?? {};
          const nextTab = tabs.find((tab: WorkbenchTab) => tab.id === tabId);
          if (!nextTab) {
            return { selectedTabId: tabId };
          }

          return {
            selectedTabId: tabId,
            selectedTabIdByWorkspaceId: {
              ...selectedTabIdByWorkspaceId,
              [nextTab.workspaceId]: tabId,
            },
          };
        });
      },
      retainWorkspaceTabs: (workspaceIds, activeWorkspaceId) => {
        const workspaceIdSet = new Set(workspaceIds);
        const previous = get();
        const previousTabs = previous.tabs ?? [];
        const removedTabIds = previousTabs
          .filter((tab: WorkbenchTab) => !workspaceIdSet.has(tab.workspaceId))
          .map((tab: WorkbenchTab) => tab.id);

        // The active workspace id is supplied by the owning Command (the Store
        // Action never reads navigation state).
        const selectedWorkspaceId = activeWorkspaceId;

        set((state) => {
          const currentTabs = state.tabs ?? [];
          const currentSelectedByWorkspaceId = state.selectedTabIdByWorkspaceId ?? {};
          const nextTabs = currentTabs.filter((tab: WorkbenchTab) => workspaceIdSet.has(tab.workspaceId));
          const nextTabIdSet = new Set(nextTabs.map((tab: WorkbenchTab) => tab.id));
          const nextSelectedTabIdByWorkspaceId = Object.fromEntries(
            Object.entries(currentSelectedByWorkspaceId).filter(
              ([workspaceId, tabId]) => workspaceIdSet.has(workspaceId) && nextTabIdSet.has(tabId),
            ),
          ) as Record<string, string>;

          return {
            tabs: nextTabs,
            selectedTabIdByWorkspaceId: nextSelectedTabIdByWorkspaceId,
            selectedTabId: resolveSelectedTabIdForWorkspace({
              workspaceId: selectedWorkspaceId,
              tabs: nextTabs,
              selectedTabIdByWorkspaceId: nextSelectedTabIdByWorkspaceId,
            }),
          };
        });

        return removedTabIds;
      },
      openTab: (input, options) => {
        const nextTabId = input.kind === "terminal" ? (input.tabId ?? createClientTabId()) : createClientTabId();
        set(
          (state) =>
            openTabState(state, input, nextTabId, {
              ...options,
              selectedWorkspaceId: options.workspaceId,
            }) ?? state,
        );
      },
      closeTab: (tabId, options) => {
        set((state) => closeTabState(state, tabId, options) ?? state);
      },
      closeOtherTabs: (tabId) => {
        set((state) => closeOtherTabsState(state, tabId) ?? state);
      },
      closeAllTabs: (tabId) => {
        set((state) => closeAllTabsState(state, tabId) ?? state);
      },
      closeAllTerminalTabs: (workspaceId) => {
        set((state) => closeAllTerminalTabsState(state, workspaceId) ?? state);
      },
      setTerminalTabSessionId: (tabId, sessionId) => {
        const normalizedTabId = tabId.trim();
        const normalizedSessionId = sessionId.trim();
        if (!normalizedTabId || !normalizedSessionId) {
          return;
        }

        set((state) => ({
          tabs: state.tabs.map((tab: WorkbenchTab) =>
            tab.id === normalizedTabId && tab.kind === "terminal"
              ? {
                  ...tab,
                  data: {
                    ...tab.data,
                    sessionId: normalizedSessionId,
                  },
                }
              : tab,
          ),
        }));
      },
      setAgentChatTabSession: ({ tabId, sessionId }) => {
        const normalizedTabId = tabId.trim();
        const normalizedSessionId = sessionId.trim();
        if (!normalizedTabId || !normalizedSessionId) {
          return;
        }

        set((state) => ({
          tabs: state.tabs.map((tab: WorkbenchTab) =>
            tab.id === normalizedTabId && tab.kind === "agent-chat"
              ? {
                  ...tab,
                  data: {
                    ...tab.data,
                    sessionId: normalizedSessionId,
                  },
                }
              : tab,
          ),
        }));
      },
      setAgentChatTabSubagentControl: ({ tabId, agentId, parentSessionId }) => {
        const normalizedTabId = tabId.trim();
        if (!normalizedTabId) {
          return;
        }

        set((state) => ({
          tabs: state.tabs.map((tab: WorkbenchTab) =>
            tab.id === normalizedTabId && tab.kind === "agent-chat"
              ? {
                  ...tab,
                  data: {
                    ...tab.data,
                    subagentAgentId: agentId?.trim() || undefined,
                    subagentParentSessionId: parentSessionId?.trim() || undefined,
                  },
                }
              : tab,
          ),
        }));
      },
      setTerminalTabAgentKind: (tabId, agentKind) => {
        const normalizedTabId = tabId.trim();
        if (!normalizedTabId) {
          return;
        }

        set((state) => ({
          tabs: state.tabs.map((tab: WorkbenchTab) =>
            tab.id === normalizedTabId && tab.kind === "terminal" ? { ...tab, data: { ...tab.data, agentKind } } : tab,
          ),
        }));
      },
      setBrowserTabFaviconUrl: (tabId, faviconUrl) => {
        const normalizedTabId = tabId.trim();
        const normalizedFaviconUrl = faviconUrl?.trim();
        if (!normalizedTabId) {
          return;
        }

        set((state) => ({
          tabs: state.tabs.map((tab: WorkbenchTab) =>
            tab.id === normalizedTabId && tab.kind === "browser"
              ? (() => {
                  const nextData = { ...tab.data };
                  if (normalizedFaviconUrl) {
                    nextData.faviconUrl = normalizedFaviconUrl;
                  } else {
                    nextData.faviconUrl = undefined;
                  }

                  return {
                    ...tab,
                    data: nextData,
                  };
                })()
              : tab,
          ),
        }));
      },
      setBrowserTabUrl: (tabId, url) => {
        const normalizedTabId = tabId.trim();
        if (!normalizedTabId) {
          return;
        }

        set((state) => {
          const tab = state.tabs.find((t: WorkbenchTab) => t.id === normalizedTabId && t.kind === "browser");
          if (tab && tab.kind === "browser") {
            tab.data.url = url;
          }
        });
      },
      toggleTabPinned: (tabId) => {
        set((state) => toggleTabPinnedState(state, tabId));
      },
      promoteTemporaryTab: (tabId) => {
        set((state) => promoteTemporaryTabState(state, tabId) ?? state);
      },
      reorderTab: (draggedTabId, targetTabId, position) => {
        set((state) => reorderTabState(state, draggedTabId, targetTabId, position) ?? state);
      },
      renameTab: (tabId, title, options) => {
        set((state) => renameTabState(state, tabId, title, options) ?? state);
      },
      renameTabsForEntryRename: (workspaceId, fromPath, toPath) => {
        set((state) => renameTabsForEntryRenameState(state, workspaceId, fromPath, toPath) ?? state);
      },
      setFileTabDirty: (tabId, isDirty) => {
        set((state) => setFileTabDirtyState(state, tabId, isDirty) ?? state);
      },
    };
  }),
);
