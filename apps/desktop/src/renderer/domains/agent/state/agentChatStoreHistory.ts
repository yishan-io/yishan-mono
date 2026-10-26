import type { Draft } from "immer";
import type { AgentChatStoreState } from "./agentChatStore";
import type { AgentChatSessionData } from "./agentChatStoreSession";

/** Echoed transport identity for a history response. */
export type HistoryResponseOptions = { requestId: string; sessionId: string };

/** One bounded pending request, ordered independently of transcript updates. */
export type HistoryRequest = HistoryResponseOptions & { generation: number };

/** Checks identity before normalization and again inside the replacement transaction. */
export function matchesHistoryRequest(
  session: AgentChatSessionData | undefined,
  response: HistoryResponseOptions,
): boolean {
  return Boolean(
    session &&
      response.requestId &&
      session.sessionId === response.sessionId &&
      session.pendingHistoryRequest?.requestId === response.requestId &&
      session.pendingHistoryRequest.sessionId === response.sessionId &&
      session.pendingHistoryRequest.generation === session.historyRequestGeneration,
  );
}

/** Creates pure request mutations without importing the store at runtime. */
export function createHistoryRequestActions(set: (recipe: (state: Draft<AgentChatStoreState>) => void) => void): {
  recordHistoryRequest: (tabId: string, sessionId: string, requestId: string) => boolean;
  clearHistoryRequest: (tabId: string, response: HistoryResponseOptions) => void;
} {
  return {
    recordHistoryRequest: (tabId, sessionId, requestId) => {
      let didRecord = false;
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session || session.sessionId !== sessionId || !requestId) return;
        session.historyRequestGeneration += 1;
        session.pendingHistoryRequest = { requestId, sessionId, generation: session.historyRequestGeneration };
        didRecord = true;
      });
      return didRecord;
    },
    clearHistoryRequest: (tabId, response) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session && matchesHistoryRequest(session, response)) session.pendingHistoryRequest = null;
      });
    },
  };
}
