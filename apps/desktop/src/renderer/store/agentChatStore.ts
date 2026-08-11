import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { trimSessionMessages, trimSubagentLiveTranscripts } from "./agentChatStoreBudget";
import { type RunningSubagentSummary, deriveFinishedSubagents, deriveRunningSubagents } from "./agentChatSubagents";
import type {
  AgentCompactionReason,
  AgentMessage,
  AgentModel,
  AgentPendingUiAutoResponse,
  AgentPendingUiRequest,
  AgentQueueState,
  AgentSessionState,
  AgentSessionStats,
  AgentSubagentCancelState,
} from "./agentChatTypes";

type AgentSubagentProgressTarget = {
  agentName: string;
  agentId: string;
  status: string;
  childSessionId?: string;
};

type AgentSessionData = {
  sessionId: string;
  state: AgentSessionState;
  /** Whether the agent has started (turn_start) but not yet ended (turn_end) the current turn. */
  isTurnActive: boolean;
  /** Id of the assistant bound to the active Pi core turn for turn_end duration finalization. */
  activeCoreTurnAssistantId: string | null;
  compactionReason: AgentCompactionReason;
  messages: AgentMessage[];
  streamingMessage: AgentMessage | null;
  availableModels: AgentModel[];
  currentModel: AgentModel | null;
  thinkingLevel: string | null;
  sessionStats: AgentSessionStats | null;
  queue: AgentQueueState;
  pendingUiRequest: AgentPendingUiRequest | null;
  pendingUiAutoResponse: AgentPendingUiAutoResponse | null;
  runningSubagents: RunningSubagentSummary[];
  finishedSubagents: RunningSubagentSummary[];
  subagentProgressTargets: AgentSubagentProgressTarget[];
  subagentLiveTranscripts: Record<string, AgentMessage[]>;
  /** Cancel feedback per running sub-agent row, keyed by childSessionId ?? rowId. */
  subagentCancelStates: Record<string, AgentSubagentCancelState>;
  /**
   * When the owning Pi process died (session_end or a fresh reopen after an
   * abrupt loss), sub-agent rows started before this moment are interrupted
   * history, not live runs. Null while the process is alive.
   */
  subagentSessionEndedAtMs: number | null;
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
  setTurnActive: (tabId: string, active: boolean) => void;
  setCompactionReason: (tabId: string, reason: AgentCompactionReason) => void;
  setSessionError: (tabId: string, error: string) => void;
  setTurnError: (tabId: string, error: string) => void;
  clearTurnError: (tabId: string) => void;
  appendMessage: (tabId: string, message: AgentMessage) => void;
  replaceMessages: (tabId: string, messages: AgentMessage[]) => void;
  updateStreamingMessage: (tabId: string, message: AgentMessage) => void;
  finalizeStreamingMessage: (tabId: string) => void;
  setActiveCoreTurnAssistantId: (tabId: string, assistantId: string | null) => void;
  finalizeActiveCoreTurnAssistant: (tabId: string, endedAtMs: number) => void;
  setAvailableModels: (tabId: string, models: AgentModel[]) => void;
  setCurrentModel: (tabId: string, model: AgentModel) => void;
  setThinkingLevel: (tabId: string, level: string) => void;
  setSessionStats: (tabId: string, stats: AgentSessionStats | null) => void;
  setQueue: (tabId: string, queue: AgentQueueState) => void;
  setPendingUiRequest: (tabId: string, request: AgentPendingUiRequest) => void;
  setPendingUiAutoResponse: (tabId: string, response: AgentPendingUiAutoResponse) => void;
  setSubagentProgressTargets: (tabId: string, targets: AgentSubagentProgressTarget[]) => void;
  setSubagentLiveTranscripts: (tabId: string, transcripts: Record<string, AgentMessage[]>) => void;
  setSubagentCancelState: (tabId: string, rowKey: string, state: AgentSubagentCancelState) => void;
  clearSubagentCancelState: (tabId: string, rowKey: string) => void;
  setSubagentSessionEndedAt: (tabId: string, endedAtMs: number | null) => void;
  clearPendingUiRequest: (tabId: string) => void;
  clearPendingUiAutoResponse: (tabId: string) => void;
  markStateLoaded: (tabId: string) => void;
  removeSession: (tabId: string) => void;
  removeSessions: (tabIds: string[]) => void;
};

function emptySession(sessionId: string): AgentSessionData {
  return {
    sessionId,
    state: "idle",
    isTurnActive: false,
    activeCoreTurnAssistantId: null,
    compactionReason: null,
    messages: [],
    streamingMessage: null,
    availableModels: [],
    currentModel: null,
    thinkingLevel: null,
    sessionStats: null,
    queue: { steering: [], followUp: [] },
    pendingUiRequest: null,
    pendingUiAutoResponse: null,
    runningSubagents: [],
    finishedSubagents: [],
    subagentProgressTargets: [],
    subagentLiveTranscripts: {},
    subagentCancelStates: {},
    subagentSessionEndedAtMs: null,
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

    setTurnActive: (tabId, active) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.isTurnActive = active;
        }
      });
    },

    setCompactionReason: (tabId, reason) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.compactionReason = reason;
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
        session.activeCoreTurnAssistantId = null;
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

    setActiveCoreTurnAssistantId: (tabId, assistantId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.activeCoreTurnAssistantId = assistantId;
        }
      });
    },

    finalizeActiveCoreTurnAssistant: (tabId, endedAtMs) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        const assistantId = session.activeCoreTurnAssistantId;
        session.activeCoreTurnAssistantId = null;
        if (!assistantId) return;
        const message = session.messages.find((candidate) => candidate.id === assistantId);
        if (!message || typeof message.startedAtMs !== "number") return;
        message.durationMs = Math.max(0, endedAtMs - message.startedAtMs);
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

    setSessionStats: (tabId, stats) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.sessionStats = stats;
        }
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

    setSubagentCancelState: (tabId, rowKey, cancelState) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.subagentCancelStates[rowKey] = cancelState;
      });
    },

    clearSubagentCancelState: (tabId, rowKey) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        delete session.subagentCancelStates[rowKey];
      });
    },

    setSubagentSessionEndedAt: (tabId, endedAtMs) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        session.subagentSessionEndedAtMs = endedAtMs;
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
