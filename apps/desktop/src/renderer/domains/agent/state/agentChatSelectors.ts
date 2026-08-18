import { agentChatStore } from "../model/agentChatStore";

/**
 * Agent feature selectors — the public read surface for Agent Chat State
 * (Phase 17, desktop6.md). Cross-feature code reads agent chat state through
 * these functions instead of importing the Agent Store directly. Use the
 * `useAgentChatSession` hook for reactive reads in components.
 */

/** Reads one agent chat session by tab id (non-reactive). */
export function selectAgentChatSession(tabId: string) {
  return agentChatStore.getState().sessionsByTabId[tabId];
}
