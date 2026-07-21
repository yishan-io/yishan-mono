import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { DesktopAgentKind } from "../helpers/agentSettings";
import { generateId } from "../helpers/generateId";
import { resolveSelectedTabIdForWorkspace } from "./tabs";
import {
  closeAllTabsState,
  closeAllTerminalTabsState,
  closeOtherTabsState,
  closeTabState,
  createSessionTabOptimisticState,
  failSessionTabInitState,
  markFileTabSavedState,
  openTabState,
  promoteTemporaryTabState,
  refreshDiffTabContentState,
  refreshFileTabFromDiskState,
  renameTabState,
  renameTabsForEntryRenameState,
  reorderTabState,
  resolveSessionTabState,
  toggleTabPinnedState,
  updateFileTabContentState,
} from "./tabs/index";
import type { OpenWorkspaceTabInput, WorkspaceTab } from "./types";
import { workspaceStore } from "./workspaceStore";

export type TabStoreState = {
  tabs: WorkspaceTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
  /** Returns workspace tabs sorted with pinned entries first. */
  getWorkspaceTabs: (workspaceId: string) => WorkspaceTab[];
  /** Resolves and applies the correct selectedTabId for the given workspace. */
  resolveTabForWorkspace: (workspaceId: string) => void;
  selectTab: (tabId: string) => void;
  retainWorkspaceTabs: (workspaceIds: string[]) => string[];
  createTab: (input?: { workspaceId?: string }) => Promise<
    { tabId: string; workspaceId: string; title: string } | undefined
  >;
  resolveSessionTab: (tabId: string, sessionId: string) => void;
  failSessionTabInit: (tabId: string) => void;
  openTab: (input: OpenWorkspaceTabInput, options?: { activePaneTabIds?: string[] }) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: (tabId: string) => void;
  /** Closes every terminal tab across all workspaces (used before daemon restart). */
  closeAllTerminalTabs: () => void;
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
  updateFileTabContent: (tabId: string, content: string) => void;
  markFileTabSaved: (tabId: string) => void;
  refreshFileTabFromDisk: (input: { tabId: string; content: string; deleted: boolean }) => void;
  refreshDiffTabContent: (input: { tabId: string; oldContent: string; newContent: string }) => void;
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
          .tabs.filter((tab: WorkspaceTab) => tab.workspaceId === workspaceId)
          .sort((leftTab: WorkspaceTab, rightTab: WorkspaceTab) => {
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
          const nextTab = tabs.find((tab: WorkspaceTab) => tab.id === tabId);
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
      retainWorkspaceTabs: (workspaceIds) => {
        const workspaceIdSet = new Set(workspaceIds);
        const previous = get();
        const previousTabs = previous.tabs ?? [];
        const removedTabIds = previousTabs
          .filter((tab: WorkspaceTab) => !workspaceIdSet.has(tab.workspaceId))
          .map((tab: WorkspaceTab) => tab.id);

        // Read selectedWorkspaceId from the single source of truth before set().
        const selectedWorkspaceId = workspaceStore.getState().selectedWorkspaceId;

        set((state) => {
          const currentTabs = state.tabs ?? [];
          const currentSelectedByWorkspaceId = state.selectedTabIdByWorkspaceId ?? {};
          const nextTabs = currentTabs.filter((tab: WorkspaceTab) => workspaceIdSet.has(tab.workspaceId));
          const nextTabIdSet = new Set(nextTabs.map((tab: WorkspaceTab) => tab.id));
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
      createTab: async (input) => {
        const targetWorkspaceId = input?.workspaceId ?? workspaceStore.getState().selectedWorkspaceId;
        if (!targetWorkspaceId) {
          return;
        }

        const tabNumber =
          get().tabs.filter((tab: WorkspaceTab) => tab.workspaceId === targetWorkspaceId && tab.kind === "session")
            .length + 1;
        const nextTabTitle = `Untitled ${tabNumber}`;
        const nextTabId = createClientTabId();

        set((state) =>
          createSessionTabOptimisticState({
            state,
            workspaceId: targetWorkspaceId,
            tabId: nextTabId,
            title: nextTabTitle,
            agentKind: "opencode",
          }),
        );

        return {
          tabId: nextTabId,
          workspaceId: targetWorkspaceId,
          title: nextTabTitle,
        };
      },
      resolveSessionTab: (tabId, sessionId) => {
        set((state) =>
          resolveSessionTabState({
            state,
            tabId,
            sessionId,
          }),
        );
      },
      failSessionTabInit: (tabId) => {
        set((state) => failSessionTabInitState(state, tabId));
      },
      openTab: (input, options?) => {
        const selectedWorkspaceId = workspaceStore.getState().selectedWorkspaceId;
        const nextTabId = input.kind === "terminal" ? (input.tabId ?? createClientTabId()) : createClientTabId();
        set((state) => openTabState(state, input, nextTabId, { ...options, selectedWorkspaceId }) ?? state);
      },
      closeTab: (tabId) => {
        set((state) => closeTabState(state, tabId) ?? state);
      },
      closeOtherTabs: (tabId) => {
        set((state) => closeOtherTabsState(state, tabId) ?? state);
      },
      closeAllTabs: (tabId) => {
        set((state) => closeAllTabsState(state, tabId) ?? state);
      },
      closeAllTerminalTabs: () => {
        const selectedWorkspaceId = workspaceStore.getState().selectedWorkspaceId;
        set((state) => closeAllTerminalTabsState(state, selectedWorkspaceId) ?? state);
      },
      setTerminalTabSessionId: (tabId, sessionId) => {
        const normalizedTabId = tabId.trim();
        const normalizedSessionId = sessionId.trim();
        if (!normalizedTabId || !normalizedSessionId) {
          return;
        }

        set((state) => ({
          tabs: state.tabs.map((tab: WorkspaceTab) =>
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
          tabs: state.tabs.map((tab: WorkspaceTab) =>
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
          tabs: state.tabs.map((tab: WorkspaceTab) =>
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
          tabs: state.tabs.map((tab: WorkspaceTab) =>
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
          tabs: state.tabs.map((tab: WorkspaceTab) =>
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
          const tab = state.tabs.find((t: WorkspaceTab) => t.id === normalizedTabId && t.kind === "browser");
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
      updateFileTabContent: (tabId, content) => {
        set((state) => updateFileTabContentState(state, tabId, content));
      },
      markFileTabSaved: (tabId) => {
        set((state) => markFileTabSavedState(state, tabId));
      },
      refreshFileTabFromDisk: (input) => {
        set((state) => refreshFileTabFromDiskState(state, input) ?? state);
      },
      refreshDiffTabContent: (input) => {
        set((state) => refreshDiffTabContentState(state, input) ?? state);
      },
    };
  }),
);
