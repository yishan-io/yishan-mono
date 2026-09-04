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
  baseline: AgentChatBilledUsage | null;
  /** Finalized parent usage observed by the renderer after the active stats snapshot. */
  deltas: Record<string, AgentChatBilledUsage>;
  deltaSeqById: Record<string, number>;
  fallback: AgentChatBilledUsage;
  usageById: Record<string, AgentChatBilledUsage>;
  liveIds: Record<string, true>;
  liveSeq: number;
  liveSeqById: Record<string, number>;
  /** Renderer-side finalization sequence captured at each correlated stats request. */
  requestSeqById: Record<string, number>;
  childUsageById: Record<string, AgentChatBilledUsage>;
};

/** Creates an empty usage ledger before transcript history or authoritative stats are received. */
export function createAgentChatUsageLedger(): AgentChatUsageLedger {
  return {
    baseline: null,
    deltas: {},
    deltaSeqById: {},
    fallback: EMPTY_BILLED_USAGE,
    usageById: {},
    liveIds: {},
    liveSeq: 0,
    liveSeqById: {},
    requestSeqById: {},
    childUsageById: {},
  };
}

/** Identifies whether usage messages came from retained history or finalized live updates. */
export type AgentChatUsageSource = "history" | "live";

/** Merges history or finalized live messages into the usage ledger. */
export function mergeUsage(
  ledger: AgentChatUsageLedger,
  messages: AgentMessage[],
  source: AgentChatUsageSource,
): AgentChatUsageLedger {
  const accumulator: UsageAccumulator = { ...ledger, hasChanges: false };

  for (const message of messages) {
    mergeParentUsage(ledger, accumulator, message, source);
    mergeChildUsage(accumulator, message, source);
  }

  return applyChanges(ledger, accumulator);
}

/** Captures the renderer-finalization boundary for a correlated stats request. */
export function recordStatsRequest(
  ledger: AgentChatUsageLedger,
  requestId: string,
): AgentChatUsageLedger {
  return {
    ...ledger,
    requestSeqById: {
      ...ledger.requestSeqById,
      [requestId]: ledger.liveSeq,
    },
  };
}

type UsageAccumulator = AgentChatUsageLedger & { hasChanges: boolean };

function applyChanges(
  ledger: AgentChatUsageLedger,
  accumulator: UsageAccumulator,
): AgentChatUsageLedger {
  if (!accumulator.hasChanges) {
    return ledger;
  }

  const { hasChanges: _hasChanges, ...changes } = accumulator;
  return { ...ledger, ...changes };
}

function mergeParentUsage(
  ledger: AgentChatUsageLedger,
  accumulator: UsageAccumulator,
  message: AgentMessage,
  source: AgentChatUsageSource,
): void {
  if (message.role !== "assistant" || (source === "history" && ledger.baseline)) {
    return;
  }

  const isLiveReplacement = source === "live" && !accumulator.liveIds[message.id];
  const existingUsage = accumulator.usageById[message.id];

  if (isLiveReplacement) {
    const sequence = accumulator.liveSeq + 1;
    accumulator.liveIds = { ...accumulator.liveIds, [message.id]: true };
    accumulator.liveSeq = sequence;
    accumulator.liveSeqById = {
      ...accumulator.liveSeqById,
      [message.id]: sequence,
    };
    accumulator.hasChanges = true;
  }

  if (!message.usage || (existingUsage && !isLiveReplacement)) {
    return;
  }

  const usage = getAgentChatAssistantBilledUsage(message.usage);
  accumulator.usageById = { ...accumulator.usageById, [message.id]: usage };
  accumulator.hasChanges = true;

  if (source === "history") {
    accumulator.fallback = sumAgentChatBilledUsage([accumulator.fallback, usage]);
    return;
  }

  if (!ledger.baseline) {
    accumulator.fallback = replaceBilledUsage(accumulator.fallback, existingUsage, usage);
    return;
  }

  const sequence = accumulator.liveSeqById[message.id];
  if (sequence === undefined) {
    return;
  }

  accumulator.deltas = { ...accumulator.deltas, [message.id]: usage };
  accumulator.deltaSeqById = {
    ...accumulator.deltaSeqById,
    [message.id]: sequence,
  };
}

function mergeChildUsage(
  accumulator: UsageAccumulator,
  message: AgentMessage,
  source: AgentChatUsageSource,
): void {
  const lifecycle = parseSubagentLifecycleMessage(message);
  if (
    lifecycle?.event !== "completed" ||
    !lifecycle.usage ||
    (source === "history" && accumulator.childUsageById[lifecycle.childSessionId])
  ) {
    return;
  }

  accumulator.childUsageById = {
    ...accumulator.childUsageById,
    [lifecycle.childSessionId]: lifecycle.usage,
  };
  accumulator.hasChanges = true;
}

/** Applies authoritative stats and compacts parent bookkeeping through its recorded request boundary. */
export function reconcileStats(
  ledger: AgentChatUsageLedger,
  stats: AgentSessionStats,
  requestId?: string,
): AgentChatUsageLedger {
  const boundary = requestId ? (ledger.requestSeqById[requestId] ?? ledger.liveSeq) : ledger.liveSeq;
  const deltas = getDeltasAfter(ledger, boundary);
  const liveSeqById = getSequencesAfter(ledger.liveSeqById, boundary);
  const usageById = Object.fromEntries(
    Object.keys(liveSeqById).flatMap((id) => {
      const usage = ledger.usageById[id];
      return usage ? [[id, usage]] : [];
    }),
  );
  const liveIds: Record<string, true> = {};
  for (const id of Object.keys(liveSeqById)) {
    liveIds[id] = true;
  }
  const requestSeqById = Object.fromEntries(
    Object.entries(ledger.requestSeqById).filter(
      ([id, requestBoundary]) => id !== requestId && requestBoundary > boundary,
    ),
  );
  return {
    ...ledger,
    baseline: getStatsUsage(stats),
    deltas,
    deltaSeqById: liveSeqById,
    fallback: EMPTY_BILLED_USAGE,
    usageById,
    liveIds,
    liveSeqById,
    requestSeqById,
  };
}

/** Returns the parent baseline or fallback total plus retained deltas and completed child totals. */
export function getTotal(ledger: AgentChatUsageLedger): AgentChatBilledUsage {
  const parentTotal = ledger.baseline
    ? sumAgentChatBilledUsage([ledger.baseline, ...Object.values(ledger.deltas)])
    : ledger.fallback;
  return sumAgentChatBilledUsage([parentTotal, ...Object.values(ledger.childUsageById)]);
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

function getDeltasAfter(ledger: AgentChatUsageLedger, boundary: number): Record<string, AgentChatBilledUsage> {
  return Object.fromEntries(
    Object.entries(ledger.liveSeqById)
      .filter(([, sequence]) => sequence > boundary)
      .flatMap(([id]) => {
        const usage = ledger.usageById[id];
        return usage ? [[id, usage]] : [];
      }),
  );
}

function getSequencesAfter(sequences: Record<string, number>, boundary: number): Record<string, number> {
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

function getStatsUsage(stats: AgentSessionStats): AgentChatBilledUsage {
  return {
    input: stats.tokens.input,
    output: stats.tokens.output,
    cacheRead: stats.tokens.cacheRead,
    cacheWrite: stats.tokens.cacheWrite,
    cost: stats.cost,
  };
}
