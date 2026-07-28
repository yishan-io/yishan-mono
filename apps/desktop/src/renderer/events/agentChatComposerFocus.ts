export const AGENT_CHAT_COMPOSER_FOCUS_EVENT = "agent-chat-composer-focus";

type ComposerFocusRequestKind = "auto" | "manual";

const pendingComposerFocusByTabId = new Map<string, ComposerFocusRequestKind>();

function dispatchComposerFocusRequest(tabId: string): void {
  window.dispatchEvent(new CustomEvent(AGENT_CHAT_COMPOSER_FOCUS_EVENT, { detail: { tabId } }));
}

/** Requests manual focus for the composer in one agent-chat tab. */
export function requestAgentChatComposerFocus(tabId: string): void {
  pendingComposerFocusByTabId.set(tabId, "manual");
  dispatchComposerFocusRequest(tabId);
}

/** Requests automatic focus after a newly created agent-chat tab has finished initial loading. */
export function requestNewAgentChatComposerFocus(tabId: string): void {
  if (pendingComposerFocusByTabId.get(tabId) !== "manual") {
    pendingComposerFocusByTabId.set(tabId, "auto");
  }
  dispatchComposerFocusRequest(tabId);
}

/** Returns the outstanding composer-focus request kind for one agent-chat tab. */
export function getAgentChatComposerFocusRequest(tabId: string): ComposerFocusRequestKind | undefined {
  return pendingComposerFocusByTabId.get(tabId);
}

/** Consumes one deferred composer-focus request for the provided agent-chat tab. */
export function consumeAgentChatComposerFocus(tabId: string): boolean {
  return pendingComposerFocusByTabId.delete(tabId);
}

/** Clears any deferred composer-focus request when its agent-chat tab closes. */
export function clearAgentChatComposerFocus(tabId: string): void {
  pendingComposerFocusByTabId.delete(tabId);
}

/** Drops deferred composer-focus requests for agent-chat tabs that are no longer open. */
export function retainOpenAgentChatComposerFocus(openTabIds: ReadonlySet<string>): void {
  for (const tabId of pendingComposerFocusByTabId.keys()) {
    if (!openTabIds.has(tabId)) {
      pendingComposerFocusByTabId.delete(tabId);
    }
  }
}
