/**
 * Shared terminal tab focus events (desktop6-adjust.md W5).
 *
 * Workbench Commands may request terminal focus for a newly opened tab
 * without importing the Terminal feature: this shared event layer holds the
 * deferred focus intent (same pattern as `events/agentChatComposerFocus.ts`)
 * and lets the Terminal view consume it when it attaches.
 */
export const TERMINAL_TAB_FOCUS_EVENT = "terminal-tab-focus";

const pendingTerminalTabIds = new Set<string>();

/** Records one pending auto-focus request for a new terminal tab. */
export function requestTerminalTabFocus(tabId: string): void {
  pendingTerminalTabIds.add(tabId);
  window.dispatchEvent(new CustomEvent(TERMINAL_TAB_FOCUS_EVENT, { detail: { tabId } }));
}

/** Consumes one pending auto-focus request for a mounted terminal tab. */
export function consumeTerminalTabFocus(tabId: string): boolean {
  return pendingTerminalTabIds.delete(tabId);
}

/** Removes pending auto-focus requests for terminal tabs that are no longer open. */
export function retainOpenTerminalTabFocus(openTabIds: ReadonlySet<string>): void {
  for (const tabId of pendingTerminalTabIds) {
    if (!openTabIds.has(tabId)) {
      pendingTerminalTabIds.delete(tabId);
    }
  }
}

/** Returns whether one terminal tab has a pending auto-focus request. */
export function hasPendingTerminalTabFocus(tabId: string): boolean {
  return pendingTerminalTabIds.has(tabId);
}

/** Test-only reset. */
export function __resetPendingTerminalTabFocusForTests(): void {
  pendingTerminalTabIds.clear();
}
