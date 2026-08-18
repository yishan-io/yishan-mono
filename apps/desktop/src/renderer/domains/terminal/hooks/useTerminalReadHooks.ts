import { terminalFocusStore } from "../state/terminalFocusStore";

/**
 * Terminal feature read-only hooks — the stable read surface for Terminal
 * State (Phase 17, desktop6.md). Cross-feature UI subscribes to terminal state
 * through these hooks instead of importing the Terminal Store directly.
 */

/** Subscribes to whether one tab has a pending auto-focus request. */
export function useHasPendingTerminalFocus(tabId: string): boolean {
  return terminalFocusStore((state) => state.pendingTabIds.has(tabId));
}
