import { create } from "zustand";


type TerminalFocusStoreState = {
  pendingTabIds: Set<string>;
  /** Records one new terminal tab that should receive focus after its view attaches. */
  requestFocus: (tabId: string) => void;
  /** Consumes one pending focus request for a mounted terminal view. */
  consumeFocus: (tabId: string) => boolean;
  /** Drops requests for terminal tabs that are no longer open. */
  retainOpenTabs: (openTabIds: ReadonlySet<string>) => void;
};

/** Stores transient focus intent between tab creation and terminal-view attachment. */
export const terminalFocusStore = create<TerminalFocusStoreState>((set, get) => ({
  pendingTabIds: new Set<string>(),
  requestFocus: (tabId) => {
    set((state) => ({ pendingTabIds: new Set(state.pendingTabIds).add(tabId) }));
  },
  consumeFocus: (tabId) => {
    if (!get().pendingTabIds.has(tabId)) {
      return false;
    }

    set((state) => {
      const pendingTabIds = new Set(state.pendingTabIds);
      pendingTabIds.delete(tabId);
      return { pendingTabIds };
    });
    return true;
  },
  retainOpenTabs: (openTabIds) => {
    set((state) => ({ pendingTabIds: new Set([...state.pendingTabIds].filter((tabId) => openTabIds.has(tabId))) }));
  },
}));

