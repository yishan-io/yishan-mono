/**
 * Workbench tab-focus intent capability (desktop8 Phase 32).
 *
 * One content-agnostic focus intent for newly opened tabs: the Workbench
 * records which tab should receive focus when its content attaches and
 * dispatches a window event for already-mounted panes. Product Domains
 * (Agent composer, Terminal) consume the intent through the Workbench public
 * API and interpret it product-specifically — Workbench never imports a
 * product Domain (R11).
 */

export const TAB_FOCUS_REQUEST_EVENT = "yishan-tab-focus-request";

export type TabFocusTarget = "agent-composer" | "terminal";
export type TabFocusKind = "auto" | "manual";

export type TabFocusRequest = {
  target: TabFocusTarget;
  kind: TabFocusKind;
};

const pendingFocusByTabId = new Map<string, TabFocusRequest>();

function dispatchTabFocusRequest(tabId: string, request: TabFocusRequest): void {
  window.dispatchEvent(new CustomEvent(TAB_FOCUS_REQUEST_EVENT, { detail: { tabId, ...request } }));
}

/** Records one deferred focus intent for a newly opened tab. */
export function requestTabFocus(tabId: string, target: TabFocusTarget, kind: TabFocusKind): void {
  pendingFocusByTabId.set(tabId, { target, kind });
  dispatchTabFocusRequest(tabId, { target, kind });
}

/** Returns the outstanding focus intent for one tab, if any. */
export function getTabFocusRequest(tabId: string): TabFocusRequest | undefined {
  return pendingFocusByTabId.get(tabId);
}

/** Consumes one deferred focus intent for the provided tab. */
export function consumeTabFocus(tabId: string): boolean {
  return pendingFocusByTabId.delete(tabId);
}

/** Clears any deferred focus intent when its tab closes. */
export function clearTabFocus(tabId: string): void {
  pendingFocusByTabId.delete(tabId);
}

/** Drops deferred focus intents for tabs that are no longer open. */
export function retainOpenTabFocus(openTabIds: ReadonlySet<string>): void {
  for (const tabId of pendingFocusByTabId.keys()) {
    if (!openTabIds.has(tabId)) {
      pendingFocusByTabId.delete(tabId);
    }
  }
}

/** Test-only reset. */
export function __resetTabFocusIntentForTests(): void {
  pendingFocusByTabId.clear();
}
