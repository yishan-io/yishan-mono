import type { TabStoreState } from "../features/workbench/state/tabStore";

type TerminalTab = Extract<TabStoreState["tabs"][number], { kind: "terminal" }>;

/**
 * Narrows one tab union entry to a terminal tab with a non-empty bound session id.
 *
 * @example
 * ```ts
 * const terminalTabs = tabs.filter(isTerminalTabWithSessionId);
 * ```
 */
export function isTerminalTabWithSessionId(
  tab: TabStoreState["tabs"][number],
): tab is TerminalTab & { data: TerminalTab["data"] & { sessionId: string } } {
  return tab.kind === "terminal" && Boolean(tab.data.sessionId?.trim());
}
