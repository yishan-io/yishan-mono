import { type RunningSubagentSummary, deriveFinishedSubagents } from "../chat/agentChatSubagents";
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
import { createTranscriptState } from "../chat/transcript/compose";
import type { LiveMessageSource } from "../chat/transcript/session";
import type { TranscriptState } from "../chat/transcript/types";
import type { HistoryRequest } from "./agentChatStoreHistory";
import { createAgentChatUsageLedger } from "./agentChatUsageLedger";

/** Display state for a live sub-agent progress row. */
export type AgentSubagentProgressTarget = {
  agentName: string;
  agentId: string;
  status: string;
  childSessionId?: string;
};

/** Mutable state for one agent-chat tab. */
export type AgentChatSessionData = {
  sessionId: string;
  historyRequestGeneration: number;
  pendingHistoryRequest: HistoryRequest | null;
  state: AgentSessionState;
  isTurnActive: boolean;
  activeCoreTurnAssistantId: string | null;
  compactionReason: AgentCompactionReason;
  transcript: TranscriptState;
  transcriptLiveSources: Record<string, LiveMessageSource>;
  messages: AgentMessage[];
  streamingMessage: AgentMessage | null;
  availableModels: AgentModel[];
  currentModel: AgentModel | null;
  thinkingLevel: string | null;
  sessionStats: AgentSessionStats | null;
  usageLedger: ReturnType<typeof createAgentChatUsageLedger>;
  rendererFinalAssistantIds: Record<string, true>;
  rendererFinalToolCallAssistantIds: Record<string, true>;
  queue: AgentQueueState;
  pendingUiRequest: AgentPendingUiRequest | null;
  pendingUiAutoResponse: AgentPendingUiAutoResponse | null;
  runningSubagents: RunningSubagentSummary[];
  finishedSubagents: RunningSubagentSummary[];
  subagentProgressTargets: AgentSubagentProgressTarget[];
  subagentLiveTranscripts: Record<string, AgentMessage[]>;
  subagentCancelStates: Record<string, AgentSubagentCancelState>;
  subagentSessionEndedAtMs: number | null;
  hasLoadedMessages: boolean;
  hasLoadedModels: boolean;
  hasLoadedState: boolean;
  error: string | null;
  turnError: string | null;
};

/** Creates state for a newly registered agent-chat session. */
export function createAgentChatSession(sessionId: string): AgentChatSessionData {
  return {
    sessionId,
    historyRequestGeneration: 0,
    pendingHistoryRequest: null,
    state: "idle",
    isTurnActive: false,
    activeCoreTurnAssistantId: null,
    compactionReason: null,
    transcript: createTranscriptState({ sessionId, namespace: `local:${sessionId}`, seed: 0 }),
    transcriptLiveSources: {},
    messages: [],
    streamingMessage: null,
    availableModels: [],
    currentModel: null,
    thinkingLevel: null,
    sessionStats: null,
    usageLedger: createAgentChatUsageLedger(),
    rendererFinalAssistantIds: {},
    rendererFinalToolCallAssistantIds: {},
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

/** Updates running sub-agent state only when its display fields changed. */
export function setRunningSubagentsIfChanged(
  session: AgentChatSessionData,
  nextRunning: RunningSubagentSummary[],
): void {
  if (
    session.runningSubagents.length === nextRunning.length &&
    session.runningSubagents.every((subagent, index) => {
      const nextSubagent = nextRunning[index];
      return (
        nextSubagent &&
        subagent.rowId === nextSubagent.rowId &&
        subagent.agentId === nextSubagent.agentId &&
        subagent.agentName === nextSubagent.agentName &&
        subagent.childSessionId === nextSubagent.childSessionId &&
        subagent.title === nextSubagent.title &&
        subagent.promptSummary === nextSubagent.promptSummary &&
        subagent.state === nextSubagent.state &&
        subagent.startedAtMs === nextSubagent.startedAtMs
      );
    })
  )
    return;
  session.runningSubagents = nextRunning;
}

/** Re-derives finished sub-agent display state from the retained transcript. */
export function setFinishedSubagents(session: AgentChatSessionData): void {
  const nextFinished = deriveFinishedSubagents(session.messages);
  if (
    session.finishedSubagents.length === nextFinished.length &&
    session.finishedSubagents.every((subagent, index) => {
      const nextSubagent = nextFinished[index];
      return (
        nextSubagent &&
        subagent.rowId === nextSubagent.rowId &&
        subagent.agentId === nextSubagent.agentId &&
        subagent.agentName === nextSubagent.agentName &&
        subagent.childSessionId === nextSubagent.childSessionId &&
        subagent.title === nextSubagent.title &&
        subagent.promptSummary === nextSubagent.promptSummary
      );
    })
  )
    return;
  session.finishedSubagents = nextFinished;
}
