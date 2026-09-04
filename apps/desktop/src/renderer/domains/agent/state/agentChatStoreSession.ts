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
  state: AgentSessionState;
  isTurnActive: boolean;
  activeCoreTurnAssistantId: string | null;
  compactionReason: AgentCompactionReason;
  messages: AgentMessage[];
  streamingMessage: AgentMessage | null;
  availableModels: AgentModel[];
  currentModel: AgentModel | null;
  thinkingLevel: string | null;
  sessionStats: AgentSessionStats | null;
  usageLedger: ReturnType<typeof createAgentChatUsageLedger>;
  rendererFinalTranscript: {
    assistantIds: Record<string, true>;
    toolCallAssistantIds: Record<string, true>;
  };
  queue: AgentQueueState;
  pendingUiRequest: AgentPendingUiRequest | null;
  pendingUiAutoResponse: AgentPendingUiAutoResponse | null;
  piRunningSubagents: RunningSubagentSummary[];
  dshRunningSubagents: RunningSubagentSummary[];
  subagentProgressTargets: AgentSubagentProgressTarget[];
  subagentLiveTranscripts: Record<string, AgentMessage[]>;
  subagentCancelStates: Record<string, AgentSubagentCancelState>;
  subagentSessionEndedAtMs: number | null;
  hydration: {
    messages: boolean;
    models: boolean;
    state: boolean;
  };
  dshTranscriptRetryAvailable: boolean;
  error: string | null;
  turnError: string | null;
};

/** Creates state for a newly registered agent-chat session. */
export function createAgentChatSession(sessionId: string): AgentChatSessionData {
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
    usageLedger: createAgentChatUsageLedger(),
    rendererFinalTranscript: {
      assistantIds: {},
      toolCallAssistantIds: {},
    },
    queue: { steering: [], followUp: [] },
    pendingUiRequest: null,
    pendingUiAutoResponse: null,
    piRunningSubagents: [],
    dshRunningSubagents: [],
    subagentProgressTargets: [],
    subagentLiveTranscripts: {},
    subagentCancelStates: {},
    subagentSessionEndedAtMs: null,
    hydration: {
      messages: false,
      models: false,
      state: false,
    },
    dshTranscriptRetryAvailable: false,
    error: null,
    turnError: null,
  };
}

/** Returns whether every independently hydrated session resource is available. */
export function isHydrated(session: AgentChatSessionData | undefined): boolean {
  return Boolean(session?.hydration.messages && session.hydration.models && session.hydration.state);
}

/** Selects Pi rows before DSH rows, retaining the prior combined array when neither source changed. */
export function selectRunningSubagents(session: AgentChatSessionData | undefined): RunningSubagentSummary[] {
  if (!session) return EMPTY_SUBAGENTS;
  const dshSelections = runningSubagentSelections.get(session.piRunningSubagents);
  const cachedRows = dshSelections?.get(session.dshRunningSubagents);
  if (cachedRows) return cachedRows;

  const rows = [...session.piRunningSubagents, ...session.dshRunningSubagents];
  const nextDshSelections = dshSelections ?? new WeakMap<RunningSubagentSummary[], RunningSubagentSummary[]>();
  nextDshSelections.set(session.dshRunningSubagents, rows);
  runningSubagentSelections.set(session.piRunningSubagents, nextDshSelections);
  return rows;
}

/** Selects completed rows from committed messages only, retaining the result while messages are unchanged. */
export function selectFinishedSubagents(session: AgentChatSessionData | undefined): RunningSubagentSummary[] {
  if (!session) return EMPTY_SUBAGENTS;
  const cachedRows = finishedSubagentSelections.get(session.messages);
  if (cachedRows) return cachedRows;

  const rows = deriveFinishedSubagents(session.messages);
  finishedSubagentSelections.set(session.messages, rows);
  return rows;
}

/** Updates Pi-derived rows only when their display fields changed. */
export function setPiRunningSubagentsIfChanged(
  session: AgentChatSessionData,
  nextRunning: RunningSubagentSummary[],
): void {
  if (areSubagentRowsEqual(session.piRunningSubagents, nextRunning)) return;
  session.piRunningSubagents = nextRunning;
}

/** Updates the authoritative DSH lineage snapshot only when its display fields changed. */
export function setDshRunningSubagentsIfChanged(
  session: AgentChatSessionData,
  nextRunning: RunningSubagentSummary[],
): void {
  if (areSubagentRowsEqual(session.dshRunningSubagents, nextRunning)) return;
  session.dshRunningSubagents = nextRunning;
}

const EMPTY_SUBAGENTS: RunningSubagentSummary[] = [];
const runningSubagentSelections = new WeakMap<
  RunningSubagentSummary[],
  WeakMap<RunningSubagentSummary[], RunningSubagentSummary[]>
>();
const finishedSubagentSelections = new WeakMap<AgentMessage[], RunningSubagentSummary[]>();

function areSubagentRowsEqual(currentRows: RunningSubagentSummary[], nextRows: RunningSubagentSummary[]): boolean {
  return (
    currentRows.length === nextRows.length &&
    currentRows.every((subagent, index) => {
      const nextSubagent = nextRows[index];
      return (
        nextSubagent &&
        subagent.rowId === nextSubagent.rowId &&
        subagent.runtime === nextSubagent.runtime &&
        subagent.agentId === nextSubagent.agentId &&
        subagent.agentName === nextSubagent.agentName &&
        subagent.childSessionId === nextSubagent.childSessionId &&
        subagent.title === nextSubagent.title &&
        subagent.promptSummary === nextSubagent.promptSummary &&
        subagent.state === nextSubagent.state &&
        subagent.startedAtMs === nextSubagent.startedAtMs
      );
    })
  );
}
