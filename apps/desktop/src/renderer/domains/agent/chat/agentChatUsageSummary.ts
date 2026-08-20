import type { AgentContentBlock, AgentMessage, AgentModel, AgentSessionStats } from "./agentChatTypes";

const CHARS_PER_TOKEN = 4;

/** Usage fields that contribute to an agent-chat billing total. Context snapshots are excluded. */
export type AgentChatBilledUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

/** Sums the four token fields billed for a parent assistant message or completed child session. */
export function getAgentChatBilledTokenTotal(
  usage: Pick<AgentChatBilledUsage, "input" | "output" | "cacheRead" | "cacheWrite">,
): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

/** Combines parent and completed-child billing usage without including context-only metadata. */
export function sumAgentChatBilledUsage(usages: Iterable<AgentChatBilledUsage>): AgentChatBilledUsage {
  const totals: AgentChatBilledUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const usage of usages) {
    totals.input += usage.input;
    totals.output += usage.output;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
    totals.cost += usage.cost;
  }

  return totals;
}

/**
 * Normalizes parent assistant usage for billing. `totalTokens` and `total`
 * are context snapshots and do not contribute to this result.
 */
export function getAgentChatAssistantBilledUsage(usage: AgentMessage["usage"]): AgentChatBilledUsage {
  return {
    input: getNonNegativeFiniteNumber(usage?.input),
    output: getNonNegativeFiniteNumber(usage?.output),
    cacheRead: getNonNegativeFiniteNumber(usage?.cacheRead),
    cacheWrite: getNonNegativeFiniteNumber(usage?.cacheWrite),
    cost: getNonNegativeFiniteNumber(usage?.cost?.total),
  };
}

/** Parses completed child usage only when every billing field is a non-negative finite number. */
export function parseAgentChatBilledUsage(value: unknown): AgentChatBilledUsage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const usage = value as Record<string, unknown>;
  const input = getRequiredNonNegativeFiniteNumber(usage.input);
  const output = getRequiredNonNegativeFiniteNumber(usage.output);
  const cacheRead = getRequiredNonNegativeFiniteNumber(usage.cacheRead);
  const cacheWrite = getRequiredNonNegativeFiniteNumber(usage.cacheWrite);
  const cost = getRequiredNonNegativeFiniteNumber(usage.cost);
  if (input === null || output === null || cacheRead === null || cacheWrite === null || cost === null) {
    return null;
  }

  return { input, output, cacheRead, cacheWrite, cost };
}

/** Structured usage summary derived from one agent-chat session. */
export type AgentChatUsageSummary = {
  contextTokens: number;
  contextWindow: number;
  contextPercent: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheRatePercent: number;
  reasoningTokens: number;
  totalSessionTokens: number;
  totalCostUsd: number;
};

/** Builds the structured agent-chat usage summary used by the composer footer UI. */
export function buildAgentChatUsageSummary(
  messages: AgentMessage[],
  currentModel: AgentModel | null,
): AgentChatUsageSummary | null {
  const contextWindow = currentModel?.contextWindow;
  if (!Number.isFinite(contextWindow) || !contextWindow || contextWindow <= 0) {
    return null;
  }

  const contextTokens = estimateAgentChatContextTokens(messages);
  const contextPercent = roundContextPercent((contextTokens / contextWindow) * 100);
  const usageTotals = sumAgentChatUsageTotals(messages);

  return {
    contextTokens,
    contextWindow,
    contextPercent,
    inputTokens: usageTotals.inputTokens,
    outputTokens: usageTotals.outputTokens,
    cacheReadTokens: usageTotals.cacheReadTokens,
    cacheWriteTokens: usageTotals.cacheWriteTokens,
    cacheRatePercent: calculateCacheRatePercent(usageTotals.inputTokens, usageTotals.cacheReadTokens),
    reasoningTokens: usageTotals.reasoningTokens,
    totalSessionTokens: usageTotals.totalSessionTokens,
    totalCostUsd: usageTotals.totalCostUsd,
  };
}

/**
 * Context percent used for the compact-button threshold: the authoritative
 * snapshot when present, otherwise the estimate over committed messages.
 * Returns 0 when neither is available (snapshot absent and no model context
 * window), which keeps the compact button safely disabled.
 */
export function getCompactContextPercent(
  messages: AgentMessage[],
  currentModel: AgentModel | null,
  sessionStats: AgentSessionStats | null,
): number {
  const snapshotPercent = sessionStats?.contextUsage?.percent;
  if (snapshotPercent != null) {
    return snapshotPercent;
  }

  return buildAgentChatUsageSummary(messages, currentModel)?.contextPercent ?? 0;
}

function estimateAgentChatContextTokens(messages: AgentMessage[]): number {
  const lastAssistantUsageIndex = findLastAssistantUsageIndex(messages);
  if (lastAssistantUsageIndex === null) {
    return messages.reduce((totalTokens, message) => totalTokens + estimateMessageTokens(message), 0);
  }

  const assistantMessage = messages[lastAssistantUsageIndex];
  if (!assistantMessage?.usage) {
    return messages.reduce((totalTokens, message) => totalTokens + estimateMessageTokens(message), 0);
  }

  let totalTokens = getUsageTotalTokens(assistantMessage.usage);
  for (let index = lastAssistantUsageIndex + 1; index < messages.length; index += 1) {
    const nextMessage = messages[index];
    if (!nextMessage) {
      continue;
    }

    totalTokens += estimateMessageTokens(nextMessage);
  }

  return totalTokens;
}

function findLastAssistantUsageIndex(messages: AgentMessage[]): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || !message.usage) {
      continue;
    }

    if (getUsageTotalTokens(message.usage) > 0) {
      return index;
    }
  }

  return null;
}

function getUsageTotalTokens(usage: NonNullable<AgentMessage["usage"]>): number {
  if (Number.isFinite(usage.totalTokens) && (usage.totalTokens ?? 0) > 0) {
    return usage.totalTokens ?? 0;
  }

  if (Number.isFinite(usage.total) && (usage.total ?? 0) > 0) {
    return usage.total ?? 0;
  }

  return (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
}

function sumAgentChatUsageTotals(
  messages: AgentMessage[],
): Omit<AgentChatUsageSummary, "label" | "contextTokens" | "contextWindow" | "contextPercent" | "cacheRatePercent"> {
  return messages.reduce(
    (totals, message) => {
      if (message.role !== "assistant" || !message.usage) {
        return totals;
      }

      const billedUsage = getAgentChatAssistantBilledUsage(message.usage);
      totals.inputTokens += billedUsage.input;
      totals.outputTokens += billedUsage.output;
      totals.cacheReadTokens += billedUsage.cacheRead;
      totals.cacheWriteTokens += billedUsage.cacheWrite;
      totals.reasoningTokens += getNonNegativeFiniteNumber(message.usage.reasoning);
      totals.totalSessionTokens += getAgentChatBilledTokenTotal(billedUsage);
      totals.totalCostUsd += billedUsage.cost;
      return totals;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalSessionTokens: 0,
      totalCostUsd: 0,
    },
  );
}

/** Rounds a context percentage to at most one decimal place. */
export function roundContextPercent(percent: number): number {
  return Math.round(percent * 10) / 10;
}

function calculateCacheRatePercent(inputTokens: number, cacheReadTokens: number): number {
  const totalCacheableTokens = inputTokens + cacheReadTokens;
  if (totalCacheableTokens <= 0) {
    return 0;
  }

  return Math.round((cacheReadTokens / totalCacheableTokens) * 100);
}

function getNonNegativeFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function getRequiredNonNegativeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function estimateMessageTokens(message: AgentMessage): number {
  if (typeof message.content === "string") {
    return estimateTextTokens(message.content);
  }

  return estimateContentBlockTokens(message.content);
}

function estimateContentBlockTokens(contentBlocks: AgentContentBlock[]): number {
  let estimatedChars = 0;

  for (const contentBlock of contentBlocks) {
    if (contentBlock.type === "text") {
      estimatedChars += contentBlock.text.length;
      continue;
    }

    if (contentBlock.type === "thinking") {
      continue;
    }

    estimatedChars += contentBlock.name.length + safeJsonStringify(contentBlock.arguments).length;
  }

  return Math.ceil(estimatedChars / CHARS_PER_TOKEN);
}

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return "[unserializable]";
  }
}
