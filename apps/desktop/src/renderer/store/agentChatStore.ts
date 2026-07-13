import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AgentMessage, AgentModel, AgentQueueState, AgentSessionState } from "./agentChatTypes";

const MAX_MESSAGES_PER_TAB = 500;

type AgentSessionData = {
  sessionId: string;
  state: AgentSessionState;
  messages: AgentMessage[];
  streamingMessage: AgentMessage | null;
  availableModels: AgentModel[];
  currentModel: AgentModel | null;
  thinkingLevel: string;
  queue: AgentQueueState;
  error: string | null;
  turnError: string | null;
};

type AgentChatStoreState = {
  sessionsByTabId: Record<string, AgentSessionData>;

  // Actions
  initSession: (tabId: string, sessionId: string) => void;
  setSessionState: (tabId: string, state: AgentSessionState) => void;
  setSessionError: (tabId: string, error: string) => void;
  setTurnError: (tabId: string, error: string) => void;
  clearTurnError: (tabId: string) => void;
  appendMessage: (tabId: string, message: AgentMessage) => void;
  updateStreamingMessage: (tabId: string, message: AgentMessage) => void;
  finalizeStreamingMessage: (tabId: string) => void;
  setAvailableModels: (tabId: string, models: AgentModel[]) => void;
  setCurrentModel: (tabId: string, model: AgentModel) => void;
  setThinkingLevel: (tabId: string, level: string) => void;
  setQueue: (tabId: string, queue: AgentQueueState) => void;
  removeSession: (tabId: string) => void;
  removeSessions: (tabIds: string[]) => void;
};

function emptySession(sessionId: string): AgentSessionData {
  return {
    sessionId,
    state: "idle",
    messages: [],
    streamingMessage: null,
    availableModels: [],
    currentModel: null,
    thinkingLevel: "medium",
    queue: { steering: [], followUp: [] },
    error: null,
    turnError: null,
  };
}

function omitKeys<T>(record: Record<string, T>, removedIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !removedIds.has(id)));
}

export const agentChatStore = create<AgentChatStoreState>()(
  immer((set) => ({
    sessionsByTabId: {},

    initSession: (tabId, sessionId) => {
      set((state) => {
        state.sessionsByTabId[tabId] = emptySession(sessionId);
      });
    },

    setSessionState: (tabId, sessionState) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.state = sessionState;
        }
      });
    },

    setSessionError: (tabId, error) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.state = "error";
          session.error = error;
        }
      });
    },

    setTurnError: (tabId, error) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.turnError = error;
        }
      });
    },

    clearTurnError: (tabId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.turnError = null;
        }
      });
    },

    appendMessage: (tabId, message) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        // Deduplicate: skip if message with same id already exists.
        if (session.messages.some((m) => m.id === message.id)) return;
        session.messages.push(message);
        if (session.messages.length > MAX_MESSAGES_PER_TAB) {
          session.messages = session.messages.slice(-MAX_MESSAGES_PER_TAB);
        }
      });
    },

    updateStreamingMessage: (tabId, message) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.streamingMessage = message;
      });
    },

    finalizeStreamingMessage: (tabId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session || !session.streamingMessage) return;
        const msg = session.streamingMessage;
        // Deduplicate: skip if message with same id already in messages.
        if (!session.messages.some((m) => m.id === msg.id)) {
          session.messages.push(msg);
        }
        session.streamingMessage = null;
      });
    },

    setAvailableModels: (tabId, models) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.availableModels = models;
        const firstModel = models[0];
        if (!session.currentModel && firstModel) {
          session.currentModel = firstModel;
        }
      });
    },

    setCurrentModel: (tabId, model) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.currentModel = model;
      });
    },

    setThinkingLevel: (tabId, level) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.thinkingLevel = level;
      });
    },

    setQueue: (tabId, queue) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.queue = queue;
      });
    },

    removeSession: (tabId) => {
      set((state) => {
        delete state.sessionsByTabId[tabId];
      });
    },

    removeSessions: (tabIds) => {
      if (tabIds.length === 0) return;
      const removed = new Set(tabIds);
      set((state) => {
        state.sessionsByTabId = omitKeys(state.sessionsByTabId, removed);
      });
    },
  })),
);
