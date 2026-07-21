export const AGENT_CHAT_COMPOSER_FOCUS_EVENT = "agent-chat-composer-focus";

/** Requests focus for the composer in one agent-chat tab. */
export function requestAgentChatComposerFocus(tabId: string): void {
  window.dispatchEvent(new CustomEvent(AGENT_CHAT_COMPOSER_FOCUS_EVENT, { detail: { tabId } }));
}
