import { parseSubagentLifecycleMessage } from "../chat/agentChatSubagents";
import type { AgentMessage, AgentSessionStats } from "../chat/agentChatTypes";
import {
  type AgentChatBilledUsage,
  getAgentChatAssistantBilledUsage,
  sumAgentChatBilledUsage,
} from "../chat/agentChatUsageSummary";

const EMPTY_BILLED_USAGE: AgentChatBilledUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

/** Non-evicting usage state for one parent session and its completed child sessions. */
export type AgentChatUsageLedger = {
  parentBaseline: AgentChatBilledUsage | null;
  /** Finalized parent usage observed by the renderer after the active stats snapshot. */
  parentPostBaselineDeltas: Record<string, AgentChatBilledUsage>;
  parentPostBaselineDeltaSequenceById: Record<string, number>;
  fallbackParentTotal: AgentChatBilledUsage;
  parentAssistantUsageById: Record<string, AgentChatBilledUsage>;
  liveParentAssistantIds: Record<string, true>;
  parentLiveFinalSequence: number;
  parentLiveFinalSequenceById: Record<string, number>;
  /** Renderer-side finalization sequence captured at each correlated stats request. */
  statsRequestBoundaryById: Record<string, number>;
  childUsageBySessionId: Record<string, AgentChatBilledUsage>;
};

/** Creates an empty usage ledger before transcript history or authoritative stats are received. */
export function createAgentChatUsageLedger(): AgentChatUsageLedger {
  return {
    parentBaseline: null,
    parentPostBaselineDeltas: {},
    parentPostBaselineDeltaSequenceById: {},
    fallbackParentTotal: EMPTY_BILLED_USAGE,
    parentAssistantUsageById: {},
    liveParentAssistantIds: {},
    parentLiveFinalSequence: 0,
    parentLiveFinalSequenceById: {},
    statsRequestBoundaryById: {},
    childUsageBySessionId: {},
  };
}

/** Merges retained history without allowing it to create post-baseline parent usage. */
export function mergeAgentChatUsageLedgerHistory(
  ledger: AgentChatUsageLedger,
  messages: AgentMessage[],
  _isInitialHistory = false,
): AgentChatUsageLedger {
  return mergeAgentChatUsageLedgerMessages(ledger, messages, "history");
}

/** Records renderer-observed finalized live messages, including child-completion corrections. */
export function recordAgentChatUsageLedgerLiveMessages(
  ledger: AgentChatUsageLedger,
  messages: AgentMessage[],
): AgentChatUsageLedger {
  return mergeAgentChatUsageLedgerMessages(ledger, messages, "live");
}

/** Captures the renderer-finalization boundary for a correlated stats request. */
export function recordAgentChatUsageLedgerStatsRequest(
  ledger: AgentChatUsageLedger,
  requestId: string,
): AgentChatUsageLedger {
  return {
    ...ledger,
    statsRequestBoundaryById: {
      ...ledger.statsRequestBoundaryById,
      [requestId]: ledger.parentLiveFinalSequence,
    },
  };
}

function mergeAgentChatUsageLedgerMessages(
  ledger: AgentChatUsageLedger,
  messages: AgentMessage[],
  source: "history" | "live",
): AgentChatUsageLedger {
  let parentAssistantUsageById = ledger.parentAssistantUsageById;
  let liveParentAssistantIds = ledger.liveParentAssistantIds;
  let fallbackParentTotal = ledger.fallbackParentTotal;
  let parentPostBaselineDeltas = ledger.parentPostBaselineDeltas;
  let parentPostBaselineDeltaSequenceById = ledger.parentPostBaselineDeltaSequenceById;
  let parentLiveFinalSequence = ledger.parentLiveFinalSequence;
  let parentLiveFinalSequenceById = ledger.parentLiveFinalSequenceById;
  let childUsageBySessionId = ledger.childUsageBySessionId;

  for (const message of messages) {
    if (message.role === "assistant" && (source === "live" || !ledger.parentBaseline)) {
      const isLiveReplacement = source === "live" && !liveParentAssistantIds[message.id];
      if (isLiveReplacement) {
        liveParentAssistantIds = { ...liveParentAssistantIds, [message.id]: true };
        const sequence = ++parentLiveFinalSequence;
        parentLiveFinalSequenceById = { ...parentLiveFinalSequenceById, [message.id]: sequence };
      }
      if (message.usage) {
        const usage = getAgentChatAssistantBilledUsage(message.usage);
        const existingUsage = parentAssistantUsageById[message.id];
        if (!existingUsage || isLiveReplacement) {
          parentAssistantUsageById = { ...parentAssistantUsageById, [message.id]: usage };
          if (source === "live") {
            const sequence = parentLiveFinalSequenceById[message.id];
            if (ledger.parentBaseline && sequence !== undefined) {
              parentPostBaselineDeltas = { ...parentPostBaselineDeltas, [message.id]: usage };
              parentPostBaselineDeltaSequenceById = {
                ...parentPostBaselineDeltaSequenceById,
                [message.id]: sequence,
              };
            } else if (!ledger.parentBaseline) {
              fallbackParentTotal = replaceBilledUsage(fallbackParentTotal, existingUsage, usage);
            }
          } else if (!ledger.parentBaseline) {
            fallbackParentTotal = sumAgentChatBilledUsage([fallbackParentTotal, usage]);
          }
        }
      }
    }

    const lifecycle = parseSubagentLifecycleMessage(message);
    if (lifecycle?.event === "completed" && lifecycle.usage) {
      if (source === "live" || !childUsageBySessionId[lifecycle.childSessionId]) {
        childUsageBySessionId = { ...childUsageBySessionId, [lifecycle.childSessionId]: lifecycle.usage };
      }
    }
  }

  return {
    ...ledger,
    parentAssistantUsageById,
    liveParentAssistantIds,
    fallbackParentTotal,
    parentPostBaselineDeltas,
    parentPostBaselineDeltaSequenceById,
    parentLiveFinalSequence,
    parentLiveFinalSequenceById,
    childUsageBySessionId,
  };
}

/** Applies authoritative stats and compacts parent bookkeeping through its recorded request boundary. */
export function reconcileAgentChatUsageLedgerStats(
  ledger: AgentChatUsageLedger,
  stats: AgentSessionStats,
  requestId?: string,
): AgentChatUsageLedger {
  const boundary = requestId
    ? (ledger.statsRequestBoundaryById[requestId] ?? ledger.parentLiveFinalSequence)
    : ledger.parentLiveFinalSequence;
  const parentPostBaselineDeltas = getDeltasAfterBoundary(ledger, boundary);
  const parentLiveFinalSequenceById = omitDeltaSequencesBeforeBoundary(ledger.parentLiveFinalSequenceById, boundary);
  const parentAssistantUsageById = Object.fromEntries(
    Object.keys(parentLiveFinalSequenceById).flatMap((id) => {
      const usage = ledger.parentAssistantUsageById[id];
      return usage ? [[id, usage]] : [];
    }),
  );
  const liveParentAssistantIds: Record<string, true> = {};
  for (const id of Object.keys(parentLiveFinalSequenceById)) {
    liveParentAssistantIds[id] = true;
  }
  const statsRequestBoundaryById = Object.fromEntries(
    Object.entries(ledger.statsRequestBoundaryById).filter(
      ([id, requestBoundary]) => id !== requestId && requestBoundary > boundary,
    ),
  );
  return {
    ...ledger,
    parentBaseline: getStatsBilledUsage(stats),
    parentPostBaselineDeltas,
    parentPostBaselineDeltaSequenceById: parentLiveFinalSequenceById,
    fallbackParentTotal: EMPTY_BILLED_USAGE,
    parentAssistantUsageById,
    liveParentAssistantIds,
    parentLiveFinalSequenceById,
    statsRequestBoundaryById,
  };
}

/** Returns the parent baseline or fallback total plus retained deltas and completed child totals. */
export function getAgentChatUsageLedgerTotal(ledger: AgentChatUsageLedger): AgentChatBilledUsage {
  const parentTotal = ledger.parentBaseline
    ? sumAgentChatBilledUsage([ledger.parentBaseline, ...Object.values(ledger.parentPostBaselineDeltas)])
    : ledger.fallbackParentTotal;
  return sumAgentChatBilledUsage([parentTotal, ...Object.values(ledger.childUsageBySessionId)]);
}

function replaceBilledUsage(
  total: AgentChatBilledUsage,
  previous: AgentChatBilledUsage | undefined,
  next: AgentChatBilledUsage,
): AgentChatBilledUsage {
  return previous
    ? sumAgentChatBilledUsage([total, negateBilledUsage(previous), next])
    : sumAgentChatBilledUsage([total, next]);
}

function getDeltasAfterBoundary(ledger: AgentChatUsageLedger, boundary: number): Record<string, AgentChatBilledUsage> {
  return Object.fromEntries(
    Object.entries(ledger.parentLiveFinalSequenceById)
      .filter(([, sequence]) => sequence > boundary)
      .flatMap(([id]) => {
        const usage = ledger.parentAssistantUsageById[id];
        return usage ? [[id, usage]] : [];
      }),
  );
}

function omitDeltaSequencesBeforeBoundary(sequences: Record<string, number>, boundary: number): Record<string, number> {
  return Object.fromEntries(Object.entries(sequences).filter(([, sequence]) => sequence > boundary));
}

function negateBilledUsage(usage: AgentChatBilledUsage): AgentChatBilledUsage {
  return {
    input: -usage.input,
    output: -usage.output,
    cacheRead: -usage.cacheRead,
    cacheWrite: -usage.cacheWrite,
    cost: -usage.cost,
  };
}

function getStatsBilledUsage(stats: AgentSessionStats): AgentChatBilledUsage {
  return {
    input: stats.tokens.input,
    output: stats.tokens.output,
    cacheRead: stats.tokens.cacheRead,
    cacheWrite: stats.tokens.cacheWrite,
    cost: stats.cost,
  };
}
