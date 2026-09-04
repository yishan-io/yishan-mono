import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  getRetainedToolResultIds,
  mergeActiveTurnHistory,
  trimSessionMessages,
  trimSubagentLiveTranscripts,
} from "../chat/agentChatRetention";
import { type RunningSubagentSummary, deriveRunningSubagents } from "../chat/agentChatSubagents";
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
  type AgentChatSessionData,
  type AgentSubagentProgressTarget,
  createAgentChatSession,
  setDshRunningSubagentsIfChanged,
  setPiRunningSubagentsIfChanged,
} from "./agentChatStoreSession";
import { mergeUsage, reconcileStats, recordStatsRequest } from "./agentChatUsageLedger";

export type AgentChatStoreState = {
  sessionsByTabId: Record<string, AgentChatSessionData>;
  dshLineageGenerationByTabId: Record<string, number>;

  // Actions
  initSession: (tabId: string, sessionId: string) => void;
  setSessionState: (tabId: string, state: AgentSessionState) => void;
  setTurnActive: (tabId: string, active: boolean) => void;
  setCompactionReason: (tabId: string, reason: AgentCompactionReason) => void;
  setSessionError: (tabId: string, error: string) => void;
  setDSHTranscriptRetryAvailable: (tabId: string, available: boolean) => void;
  setTurnError: (tabId: string, error: string) => void;
  clearTurnError: (tabId: string) => void;
  appendMessage: (tabId: string, message: AgentMessage) => void;
  replaceMessages: (tabId: string, messages: AgentMessage[]) => void;
  updateStreamingMessage: (tabId: string, message: AgentMessage) => void;
  finalizeStreamingMessage: (tabId: string) => void;
  clearStreamingMessage: (tabId: string) => void;
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
  setPiRunningSubagents: (tabId: string, rows: RunningSubagentSummary[]) => void;
  setDshRunningSubagents: (tabId: string, rows: RunningSubagentSummary[]) => void;
  beginDshSubagentLineageRefresh: (tabId: string, parentSessionId: string) => number | null;
  applyDshSubagentLineageRefresh: (input: {
    tabId: string;
    parentSessionId: string;
    generation: number;
    rows: RunningSubagentSummary[];
  }) => void;
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

function retainMessageIds(messageIds: Record<string, true>, messages: AgentMessage[]): Record<string, true> {
  const retainedMessageIds = new Set(messages.map((message) => message.id));
  return Object.fromEntries(Object.entries(messageIds).filter(([messageId]) => retainedMessageIds.has(messageId)));
}

function hasToolCall(message: AgentMessage): boolean {
  return (
    message.role === "assistant" &&
    Array.isArray(message.content) &&
    message.content.some((block) => block.type === "toolCall")
  );
}

export const agentChatStore = create<AgentChatStoreState>()(
  immer((set, get) => ({
    sessionsByTabId: {},
    dshLineageGenerationByTabId: {},

    initSession: (tabId, sessionId) => {
      set((state) => {
        state.sessionsByTabId[tabId] = createAgentChatSession(sessionId);
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

    setDSHTranscriptRetryAvailable: (tabId, available) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.dshTranscriptRetryAvailable = available;
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
        session.usageLedger = mergeUsage(session.usageLedger, [message], "live");
        // Deduplicate: skip if message with same id already exists.
        if (session.messages.some((m) => m.id === message.id)) return;
        session.messages.push(message);
        if (message.role === "assistant") {
          session.rendererFinalTranscript.assistantIds[message.id] = true;
        }
        if (hasToolCall(message)) {
          session.rendererFinalTranscript.toolCallAssistantIds[message.id] = true;
        }
        session.messages = trimSessionMessages(session.messages);
        session.rendererFinalTranscript.assistantIds = retainMessageIds(
          session.rendererFinalTranscript.assistantIds,
          session.messages,
        );
        session.rendererFinalTranscript.toolCallAssistantIds = retainMessageIds(
          session.rendererFinalTranscript.toolCallAssistantIds,
          session.messages,
        );
        setPiRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, session.streamingMessage, session.subagentSessionEndedAtMs),
        );
      });
    },

    replaceMessages: (tabId, messages) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session) return;
        const hasLiveStream =
          Boolean(session.streamingMessage) && (session.isTurnActive || session.state === "running");
        const historyMessages = hasLiveStream
          ? messages.filter((message) => message.id !== session.streamingMessage?.id)
          : messages;
        session.usageLedger = mergeUsage(session.usageLedger, historyMessages, "history");
        const retainedToolResultIds = getRetainedToolResultIds(
          historyMessages,
          session.messages,
          session.rendererFinalTranscript.assistantIds,
          session.rendererFinalTranscript.toolCallAssistantIds,
        );
        const nextMessages = mergeActiveTurnHistory(
          historyMessages,
          session.messages,
          session.rendererFinalTranscript.assistantIds,
          session.rendererFinalTranscript.toolCallAssistantIds,
        );
        session.messages = trimSessionMessages(nextMessages, retainedToolResultIds);
        session.rendererFinalTranscript.assistantIds = retainMessageIds(
          session.rendererFinalTranscript.assistantIds,
          session.messages,
        );
        session.rendererFinalTranscript.toolCallAssistantIds = retainMessageIds(
          session.rendererFinalTranscript.toolCallAssistantIds,
          session.messages,
        );
        session.hydration.messages = true;
        if (!hasLiveStream) {
          session.streamingMessage = null;
          session.activeCoreTurnAssistantId = null;
        }
        setPiRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, session.streamingMessage, session.subagentSessionEndedAtMs),
        );
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
        setPiRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, session.streamingMessage, session.subagentSessionEndedAtMs),
        );
      });
    },

    finalizeStreamingMessage: (tabId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (!session || !session.streamingMessage) return;
        const msg = session.streamingMessage;
        session.usageLedger = mergeUsage(session.usageLedger, [msg], "live");
        const existingMessageIndex = session.messages.findIndex((message) => message.id === msg.id);
        if (existingMessageIndex >= 0) {
          session.messages[existingMessageIndex] = msg;
        } else {
          session.messages.push(msg);
        }
        session.messages = trimSessionMessages(session.messages);
        if (msg.role === "assistant") {
          session.rendererFinalTranscript.assistantIds[msg.id] = true;
        }
        if (hasToolCall(msg)) {
          session.rendererFinalTranscript.toolCallAssistantIds[msg.id] = true;
        }
        session.streamingMessage = null;
        session.rendererFinalTranscript.assistantIds = retainMessageIds(
          session.rendererFinalTranscript.assistantIds,
          session.messages,
        );
        session.rendererFinalTranscript.toolCallAssistantIds = retainMessageIds(
          session.rendererFinalTranscript.toolCallAssistantIds,
          session.messages,
        );
        setPiRunningSubagentsIfChanged(
          session,
          deriveRunningSubagents(session.messages, undefined, session.subagentSessionEndedAtMs),
        );
      });
    },

    clearStreamingMessage: (tabId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.streamingMessage = null;
        }
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
        session.hydration.models = true;
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
          session.usageLedger = recordStatsRequest(session.usageLedger, requestId);
        }
      });
    },

    setSessionStats: (tabId, stats, requestId) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) {
          session.sessionStats = stats;
          if (stats) {
            session.usageLedger = reconcileStats(session.usageLedger, stats, requestId);
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

    setPiRunningSubagents: (tabId, rows) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) setPiRunningSubagentsIfChanged(session, rows);
      });
    },

    setDshRunningSubagents: (tabId, rows) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session) setDshRunningSubagentsIfChanged(session, rows);
      });
    },

    beginDshSubagentLineageRefresh: (tabId, parentSessionId) => {
      const session = get().sessionsByTabId[tabId];
      if (session?.sessionId !== parentSessionId) return null;

      let generation: number | null = null;
      set((state) => {
        const nextGeneration = (state.dshLineageGenerationByTabId[tabId] ?? 0) + 1;
        state.dshLineageGenerationByTabId[tabId] = nextGeneration;
        generation = nextGeneration;
      });
      return generation;
    },

    applyDshSubagentLineageRefresh: ({ tabId, parentSessionId, generation, rows }) => {
      set((state) => {
        const session = state.sessionsByTabId[tabId];
        if (session?.sessionId !== parentSessionId || state.dshLineageGenerationByTabId[tabId] !== generation) {
          return;
        }
        setDshRunningSubagentsIfChanged(session, rows);
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
        setPiRunningSubagentsIfChanged(
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
        session.hydration.state = true;
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
