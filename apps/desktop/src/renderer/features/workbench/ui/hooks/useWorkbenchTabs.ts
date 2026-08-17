import { tabStore } from "../../state/tabStore";
import type { WorkspaceTab } from "../../model/types";

/**
 * Workbench read-only hooks — the stable read surface for Workbench Tab State
 * (Phase 17, desktop6.md). Cross-feature UI subscribes to tab state through
 * these hooks instead of importing the Workbench Store directly.
 */

/** Subscribes to the workspace tab list. */
export function useWorkspaceTabs(): WorkspaceTab[] {
  return tabStore((state) => state.tabs);
}

/** Subscribes to the currently selected tab id. */
export function useSelectedTabId(): string {
  return tabStore((state) => state.selectedTabId);
}

/** Subscribes to one tab by id. */
export function useTabById(tabId: string): WorkspaceTab | undefined {
  return tabStore((state) => state.tabs.find((tab) => tab.id === tabId));
}
