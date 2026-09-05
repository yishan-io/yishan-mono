import type { DshDelegationLifecycleState } from "../chat/agentChatDshDelegation";
import type { RunningSubagentSummary } from "../chat/agentChatSubagents";
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
import type { AgentChatSessionData, AgentSubagentProgressTarget } from "./agentChatStoreSession";

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
  setCurrentModel: (tabId: string, model: AgentModel | null) => void;
  setThinkingLevel: (tabId: string, level: string) => void;
  recordSessionStatsRequest: (tabId: string, requestId: string) => void;
  setSessionStats: (tabId: string, stats: AgentSessionStats | null, requestId?: string) => void;
  setQueue: (tabId: string, queue: AgentQueueState) => void;
  setPendingUiRequest: (tabId: string, request: AgentPendingUiRequest) => void;
  setPendingUiAutoResponse: (tabId: string, response: AgentPendingUiAutoResponse) => void;
  setPiRunningSubagents: (tabId: string, rows: RunningSubagentSummary[]) => void;
  setDshRunningSubagents: (tabId: string, rows: RunningSubagentSummary[]) => void;
  setDshDelegationLifecycle: (tabId: string, lifecycle: DshDelegationLifecycleState) => void;
  replaceDshDelegationLifecycle: (
    tabId: string,
    lifecycleByChildSessionId: Record<string, DshDelegationLifecycleState>,
  ) => void;
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
