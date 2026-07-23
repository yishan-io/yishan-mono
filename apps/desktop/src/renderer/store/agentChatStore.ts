import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  MAX_PER_TAB_AGGREGATE_UTF8_BYTES,
  MAX_SUBAGENT_AGGREGATE_UTF8_BYTES,
  MAX_SUBAGENT_CHILDREN,
  MAX_SUBAGENT_MESSAGES_PER_CHILD,
  countMessageUtf8Bytes,
} from "../helpers/agentChatBudget";
import { type RunningSubagentSummary, deriveFinishedSubagents, deriveRunningSubagents } from "./agentChatSubagents";
import type {
  AgentMessage,
  AgentModel,
  AgentPendingUiAutoResponse,
  AgentPendingUiRequest,
  AgentQueueState,
  AgentSessionState,
} from "./agentChatTypes";

const MAX_MESSAGES_PER_TAB = 500;

type AgentSubagentProgressTarget = {
  agentName: string;
  agentId: string;
  status: string;
  childSessionId?: string;
};

type AgentSessionData = {
  sessionId: string;
  state: AgentSessionState;
  messages: AgentMessage[];
  streamingMessage: AgentMessage | null;
  availableModels: AgentModel[];
  currentModel: AgentModel | null;
  thinkingLevel: string;
  queue: AgentQueueState;
  pendingUiRequest: AgentPendingUiRequest | null;
  pendingUiAutoResponse: AgentPendingUiAutoResponse | null;
  runningSubagents: RunningSubagentSummary[];
  finishedSubagents: RunningSubagentSummary[];
  subagentProgressTargets: AgentSubagentProgressTarget[];
  subagentLiveTranscripts: Record<string, AgentMessage[]>;
  hasLoadedMessages: boolean;
  hasLoadedModels: boolean;
  hasLoadedState: boolean;
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
  replaceMessages: (tabId: string, messages: AgentMessage[]) => void;
  updateStreamingMessage: (tabId: string, message: AgentMessage) => void;
  finalizeStreamingMessage: (tabId: string) => void;
  setAvailableModels: (tabId: string, models: AgentModel[]) => void;
  setCurrentModel: (tabId: string, model: AgentModel) => void;
  setThinkingLevel: (tabId: string, level: string) => void;
  setQueue: (tabId: string, queue: AgentQueueState) => void;
  setPendingUiRequest: (tabId: string, request: AgentPendingUiRequest) => void;
  setPendingUiAutoResponse: (tabId: string, response: AgentPendingUiAutoResponse) => void;
  setSubagentProgressTargets: (tabId: string, targets: AgentSubagentProgressTarget[]) => void;
  setSubagentLiveTranscripts: (tabId: string, transcripts: Record<string, AgentMessage[]>) => void;
  clearPendingUiRequest: (tabId: string) => void;
  clearPendingUiAutoResponse: (tabId: string) => void;
  markStateLoaded: (tabId: string) => void;
  removeSession: (tabId: string) => void;
  removeSessions: (tabIds: string[]) => void;
};

/**
 * Trims session messages to fit within MAX_MESSAGES_PER_TAB and the aggregate
 * UTF-8 byte budget. Keeps newest messages; a single oversized message is
 * retained rather than leaving the transcript empty.
 */
function trimSessionMessages(messages: AgentMessage[]): AgentMessage[] {
  // 1. Apply count cap (keep newest).
  let trimmed = messages;
  if (trimmed.length > MAX_MESSAGES_PER_TAB) {
    trimmed = trimmed.slice(-MAX_MESSAGES_PER_TAB);
  }

  // 2. Apply aggregate byte budget (keep newest).
  let totalBytes = 0;
  const kept: AgentMessage[] = [];
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const msg = trimmed[i];
    if (!msg) continue;
    const msgBytes = countMessageUtf8Bytes(msg);
    // Always keep at least one message even if it exceeds the budget.
    if (totalBytes + msgBytes <= MAX_PER_TAB_AGGREGATE_UTF8_BYTES || kept.length === 0) {
      kept.unshift(msg);
      totalBytes += msgBytes;
    } else {
      break;
    }
  }
  return kept;
}

/**
 * Trims subagent live transcripts to fit within per-child and aggregate limits.
 * Caps child count, per-child message count, and aggregate bytes across all
 * children. Retains newest children/messages deterministically (sorted by childSessionId).
 */
function trimSubagentLiveTranscripts(transcripts: Record<string, AgentMessage[]>): Record<string, AgentMessage[]> {
  const childIds = Object.keys(transcripts).sort();

  // 1. Cap child count (keep last alphabetically = newest in typical ordered IDs).
  const cappedChildIds = childIds.slice(-MAX_SUBAGENT_CHILDREN);

  // 2. Cap per-child message count.
  const perChildCapped: Record<string, AgentMessage[]> = {};
  for (const childId of cappedChildIds) {
    const messages = transcripts[childId];
    if (!messages) continue;
    perChildCapped[childId] = messages.slice(-MAX_SUBAGENT_MESSAGES_PER_CHILD);
  }

  // 3. Apply aggregate byte budget across children (keep newest = last in sorted order).
  let totalBytes = 0;
  const keptChildIds: string[] = [];
  for (let i = cappedChildIds.length - 1; i >= 0; i--) {
    const childId = cappedChildIds[i];
    if (!childId) continue;
    const messages = perChildCapped[childId];
    if (!messages) continue;
    const childBytes = messages.reduce((sum: number, msg: AgentMessage) => sum + countMessageUtf8Bytes(msg), 0);
    // Always keep at least one child even if it exceeds the budget.
    if (totalBytes + childBytes <= MAX_SUBAGENT_AGGREGATE_UTF8_BYTES || keptChildIds.length === 0) {
      keptChildIds.unshift(childId);
      totalBytes += childBytes;
    } else {
      break;
    }
  }

  const result: Record<string, AgentMessage[]> = {};
  for (const childId of keptChildIds) {
    const childMessages = perChildCapped[childId];
    if (childMessages) result[childId] = childMessages;
  }
  return result;
}

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
    pendingUiRequest: null,
    pendingUiAutoResponse: null,
    runningSubagents: [],
    finishedSubagents: [],
    subagentProgressTargets: [],
    subagentLiveTranscripts: {},
    hasLoadedMessages: false,
    hasLoadedModels: false,
    hasLoadedState: false,
    error: null,
    turnError: null,
  };
}

function omitKeys<T>(record: Record<string, T>, removedIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !removedIds.has(id)));
}

function setRunningSubagentsIfChanged(session: AgentSessionData, nextRunningSubagents: RunningSubagentSummary[]): void {
  if (session.runningSubagents.length === nextRunningSubagents.length) {
    const isUnchanged = session.runningSubagents.every((subagent, index) => {
      const nextSubagent = nextRunningSubagents[index];
      return (
        nextSubagent &&
        subagent.rowId === nextSubagent.rowId &&
        subagent.agentId === nextSubagent.agentId &&
        subagent.agentName === nextSubagent.agentName &&
        subagent.childSessionId === nextSubagent.childSessionId &&
        subagent.title === nextSubagent.title &&
        subagent.promptSummary === nextSubagent.promptSummary
      );
    });
    if (isUnchanged) {
      return;
    }
  }

  session.runningSubagents = nextRunningSubagents;
}

function setFinishedSubagents(session: AgentSessionData): void {
  const nextFinishedSubagents = deriveFinishedSubagents(session.messages);
  if (session.finishedSubagents.length === nextFinishedSubagents.length) {
    const isUnchanged = session.finishedSubagents.every((subagent, index) => {
      const nextSubagent = nextFinishedSubagents[index];
      return (
        nextSubagent &&
        subagent.rowId === nextSubagent.rowId &&
        subagent.agentId === nextSubagent.agentId &&
        subagent.agentName === nextSubagent.agentName &&
        subagent.childSessionId === nextSubagent.childSessionId &&
        subagent.title === nextSubagent.title &&
        subagent.promptSummary === nextSubagent.promptSummary
      );
    });
    if (isUnchanged) {
      return;
    }
  }

  session.finishedSubagents = nextFinishedSubagents;
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
        session.messages = trimSessionMessages(session.messages);
        setRunningSubagentsIfChanged(session, deriveRunningSubagents(session.messages, session.streamingMessage));
        setFinishedSubagents(session);
      });
    },

    replaceMessages: (tabId, messages) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.messages = trimSessionMessages(messages);
        session.streamingMessage = null;
        session.hasLoadedMessages = true;
        setRunningSubagentsIfChanged(session, deriveRunningSubagents(session.messages));
        setFinishedSubagents(session);
      });
    },

    updateStreamingMessage: (tabId, message) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.streamingMessage = message;
        setRunningSubagentsIfChanged(session, deriveRunningSubagents(session.messages, session.streamingMessage));
        setFinishedSubagents(session);
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
        session.messages = trimSessionMessages(session.messages);
        session.streamingMessage = null;
        setRunningSubagentsIfChanged(session, deriveRunningSubagents(session.messages));
        setFinishedSubagents(session);
      });
    },

    setAvailableModels: (tabId, models) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.availableModels = models;
        session.hasLoadedModels = true;
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

    setPendingUiRequest: (tabId, request) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.pendingUiRequest = request;
      });
    },

    setPendingUiAutoResponse: (tabId, response) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.pendingUiAutoResponse = response;
      });
    },

    setSubagentProgressTargets: (tabId, targets) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.subagentProgressTargets = targets;
      });
    },

    setSubagentLiveTranscripts: (tabId, transcripts) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.subagentLiveTranscripts = trimSubagentLiveTranscripts(transcripts);
      });
    },

    clearPendingUiRequest: (tabId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.pendingUiRequest = null;
      });
    },

    clearPendingUiAutoResponse: (tabId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.pendingUiAutoResponse = null;
      });
    },

    markStateLoaded: (tabId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.hasLoadedState = true;
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
