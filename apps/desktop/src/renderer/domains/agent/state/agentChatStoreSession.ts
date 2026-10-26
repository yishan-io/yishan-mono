import type { Draft } from "immer";
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
import { projectTranscript } from "../chat/transcript/presentation";
import type { TranscriptDisplay } from "../chat/transcript/presentation.types";
import type { LiveMessageSource } from "../chat/transcript/session";
import type { SubagentSnapshot, SubagentSnapshotCoverage } from "../chat/transcript/subagentSnapshots.types";
import type { TranscriptState } from "../chat/transcript/types";
import type { AgentChatStoreState } from "./agentChatStore";
import type { HistoryRequest } from "./agentChatStoreHistory";
import { stopSubagentSnapshotDetail } from "./agentChatStoreSubagentSnapshots";
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
  presentation: TranscriptDisplay;
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
  subagentSnapshots: Record<string, SubagentSnapshot>;
  subagentSnapshotBinding: { parentSessionId: string; childSessionId: string } | null;
  subagentSnapshotCoverage: SubagentSnapshotCoverage | null;
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
  const transcript = createTranscriptState({ sessionId, namespace: `local:${sessionId}`, seed: 0 });
  return {
    sessionId,
    historyRequestGeneration: 0,
    pendingHistoryRequest: null,
    state: "idle",
    isTurnActive: false,
    activeCoreTurnAssistantId: null,
    compactionReason: null,
    transcript,
    presentation: projectTranscript(transcript),
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
    subagentSnapshots: {},
    subagentSnapshotBinding: null,
    subagentSnapshotCoverage: null,
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

/** Removes parent sessions while stopping their same-store live detail views. */
export function createSessionRemovalActions(
  set: (recipe: (state: Draft<AgentChatStoreState>) => void) => void,
): Pick<AgentChatStoreState, "removeSession" | "removeSessions"> {
  return {
    removeSession: (tabId) => {
      set((state) => {
        const parent = state.sessionsByTabId[tabId];
        for (const detail of Object.values(state.sessionsByTabId)) {
          if (parent && detail.subagentSnapshotBinding?.parentSessionId === parent.sessionId) {
            stopSubagentSnapshotDetail(detail);
          }
        }
        delete state.sessionsByTabId[tabId];
      });
    },

    removeSessions: (tabIds) => {
      if (tabIds.length === 0) return;
      const removed = new Set(tabIds);
      set((state) => {
        const parentIds = new Set(tabIds.map((id) => state.sessionsByTabId[id]?.sessionId));
        for (const detail of Object.values(state.sessionsByTabId)) {
          if (detail.subagentSnapshotBinding && parentIds.has(detail.subagentSnapshotBinding.parentSessionId)) {
            stopSubagentSnapshotDetail(detail);
          }
        }
        state.sessionsByTabId = Object.fromEntries(
          Object.entries(state.sessionsByTabId).filter(([id]) => !removed.has(id)),
        );
      });
    },
  };
}
