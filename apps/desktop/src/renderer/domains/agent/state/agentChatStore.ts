import { castDraft } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  getRetainedToolResultIds,
  mergeActiveTurnHistory,
  trimSubagentLiveTranscripts,
} from "../chat/agentChatRetention";
import { deriveRunningSubagents } from "../chat/agentChatSubagents";
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
} from "../chat/agentChatTypes";
import {
  type ToolExecutionObservation,
  applySessionToolExecution,
  settleSessionToolExecutions,
} from "./agentChatStoreExecution";
import {
  type HistoryResponseOptions,
  createHistoryRequestActions,
  matchesHistoryRequest,
} from "./agentChatStoreHistory";
import {
  type AgentChatSessionData,
  type AgentSubagentProgressTarget,
  createAgentChatSession,
  setFinishedSubagents,
  setRunningSubagentsIfChanged,
} from "./agentChatStoreSession";
import { reconcileLiveMessages, refreshSessionTranscript, registerLiveMessage } from "./agentChatStoreTranscript";
import {
  mergeAgentChatUsageLedgerHistory,
  reconcileAgentChatUsageLedgerStats,
  recordAgentChatUsageLedgerLiveMessages,
  recordAgentChatUsageLedgerStatsRequest,
} from "./agentChatUsageLedger";

export type AgentChatStoreState = {
  sessionsByTabId: Record<string, AgentChatSessionData>;

  /** Applies validated main-session runtime evidence. */
  applyToolExecution: (tabId: string, observation: ToolExecutionObservation) => void;

  /** Settles only known unfinished execution evidence. */
  settleToolExecutions: (tabId: string, reason: "settled" | "interrupted") => void;

  // Actions
  initSession: (tabId: string, sessionId: string) => void;
  setSessionState: (tabId: string, state: AgentSessionState) => void;
  setTurnActive: (tabId: string, active: boolean) => void;
  setCompactionReason: (tabId: string, reason: AgentCompactionReason) => void;
  setSessionError: (tabId: string, error: string) => void;
  setTurnError: (tabId: string, error: string) => void;
  clearTurnError: (tabId: string) => void;
  appendMessage: (tabId: string, message: AgentMessage) => void;
  replaceMessages: (tabId: string, messages: AgentMessage[], response?: HistoryResponseOptions) => void;
  recordHistoryRequest: (tabId: string, sessionId: string, requestId: string) => boolean;
  clearHistoryRequest: (tabId: string, response: HistoryResponseOptions) => void;
  updateStreamingMessage: (tabId: string, message: AgentMessage) => void;
  finalizeStreamingMessage: (tabId: string) => void;
  setActiveCoreTurnAssistantId: (tabId: string, assistantId: string | null) => void;
  finalizeActiveCoreTurnAssistant: (tabId: string, endedAtMs: number) => void;
  setAvailableModels: (tabId: string, models: AgentModel[]) => void;
  setCurrentModel: (tabId: string, model: AgentModel) => void;
  setThinkingLevel: (tabId: string, level: string) => void;
  recordSessionStatsRequest: (tabId: string, requestId: string) => void;
  setSessionStats: (tabId: string, stats: AgentSessionStats | null, requestId?: string) => void;
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

function omitKeys<T>(record: Record<string, T>, removedIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !removedIds.has(id)));
}

function hasToolCall(message: AgentMessage): boolean {
  return (
    message.role === "assistant" &&
    Array.isArray(message.content) &&
    message.content.some((block) => block.type === "toolCall")
  );
}

export const agentChatStore = create<AgentChatStoreState>()(
  immer((set) => ({
    sessionsByTabId: {},
    ...createHistoryRequestActions(set),

    applyToolExecution: (tabId, observation) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) applySessionToolExecution(session, observation);
      });
    },

    settleToolExecutions: (tabId, reason) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) settleSessionToolExecutions(session, reason);
      });
    },

    initSession: (tabId, sessionId) => {
      set((state) => {
        state.sessionsByTabId[tabId] = castDraft(createAgentChatSession(sessionId));
      });
    },

    setSessionState: (tabId, sessionState) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.state = sessionState;
          refreshSessionTranscript(session);
        }
      });
    },

    setTurnActive: (tabId, active) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.isTurnActive = active;
          refreshSessionTranscript(session);
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
          refreshSessionTranscript(session);
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
        session.usageLedger = recordAgentChatUsageLedgerLiveMessages(session.usageLedger, [message]);
        // Deduplicate: skip if message with same id already exists.
        if (session.messages.some((m) => m.id === message.id)) return;
        session.messages.push(message);
        registerLiveMessage(session, message.id, true);
        if (message.role === "assistant") {
          session.rendererFinalAssistantIds[message.id] = true;
        }
        if (hasToolCall(message)) {
          session.rendererFinalToolCallAssistantIds[message.id] = true;
        }
        refreshSessionTranscript(session);
        setRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, session.streamingMessage, session.subagentSessionEndedAtMs),
        );
        setFinishedSubagents(session);
      });
    },

    replaceMessages: (tabId, messages, response) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        if (response) {
          if (!matchesHistoryRequest(session, response)) return;
          session.pendingHistoryRequest = null;
        }
        const hasLiveStream =
          Boolean(session.streamingMessage) && (session.isTurnActive || session.state === "running");
        const historyMessages = hasLiveStream
          ? messages.filter((message) => message.id !== session.streamingMessage?.id)
          : messages;
        session.usageLedger = mergeAgentChatUsageLedgerHistory(
          session.usageLedger,
          historyMessages,
          !session.hasLoadedMessages,
        );
        const retainedToolResultIds = getRetainedToolResultIds(
          historyMessages,
          session.messages,
          session.rendererFinalAssistantIds,
          session.rendererFinalToolCallAssistantIds,
        );
        const nextMessages = mergeActiveTurnHistory(
          historyMessages,
          session.messages,
          session.rendererFinalAssistantIds,
          session.rendererFinalToolCallAssistantIds,
        );
        reconcileLiveMessages(session, nextMessages);
        session.messages = nextMessages;
        session.hasLoadedMessages = true;
        if (!hasLiveStream) {
          session.streamingMessage = null;
          session.activeCoreTurnAssistantId = null;
        }
        refreshSessionTranscript(session, retainedToolResultIds, false);
        setRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, session.streamingMessage, session.subagentSessionEndedAtMs),
        );
        setFinishedSubagents(session);
      });
    },

    updateStreamingMessage: (tabId, message) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        // A delayed history response can contain an obsolete partial with this
        // ID. Once live streaming begins, it is the authoritative source.
        session.messages = session.messages.filter((committedMessage) => committedMessage.id !== message.id);
        session.streamingMessage = message;
        registerLiveMessage(session, message.id, false);
        refreshSessionTranscript(session);
        setRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, session.streamingMessage, session.subagentSessionEndedAtMs),
        );
        setFinishedSubagents(session);
      });
    },

    finalizeStreamingMessage: (tabId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session || !session.streamingMessage) return;
        const msg = session.streamingMessage;
        registerLiveMessage(session, msg.id, true);
        session.usageLedger = recordAgentChatUsageLedgerLiveMessages(session.usageLedger, [msg]);
        const existingMessageIndex = session.messages.findIndex((message) => message.id === msg.id);
        if (existingMessageIndex >= 0) {
          session.messages[existingMessageIndex] = msg;
        } else {
          session.messages.push(msg);
        }
        if (msg.role === "assistant") {
          session.rendererFinalAssistantIds[msg.id] = true;
        }
        if (hasToolCall(msg)) {
          session.rendererFinalToolCallAssistantIds[msg.id] = true;
        }
        session.streamingMessage = null;
        refreshSessionTranscript(session);
        setRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, undefined, session.subagentSessionEndedAtMs),
        );
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
        refreshSessionTranscript(session);
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

    recordSessionStatsRequest: (tabId, requestId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.usageLedger = recordAgentChatUsageLedgerStatsRequest(session.usageLedger, requestId);
        }
      });
    },

    setSessionStats: (tabId, stats, requestId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.sessionStats = stats;
          if (stats) {
            session.usageLedger = reconcileAgentChatUsageLedgerStats(session.usageLedger, stats, requestId);
            session.rendererFinalAssistantIds = { ...session.usageLedger.liveParentAssistantIds };
          }
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
        setRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, session.streamingMessage, endedAtMs),
        );
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
