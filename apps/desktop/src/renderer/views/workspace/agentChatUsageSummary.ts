import type { AgentContentBlock, AgentMessage, AgentModel } from "../../store/agentChatTypes";

const CHARS_PER_TOKEN = 4;
const tokenCountFormatter = new Intl.NumberFormat("en-US");
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Structured usage summary derived from one agent-chat session. */
export type AgentChatUsageSummary = {
  label: string;
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
  const contextPercent = Math.round((contextTokens / contextWindow) * 100);
  const usageTotals = sumAgentChatUsageTotals(messages);
  const totalCostUsd = sumAgentChatCostUsd(messages);

  return {
    label: `ctx: ${formatCompactTokenCount(contextTokens)}/${formatCompactTokenCount(contextWindow)} (${contextPercent}%), ${formatUsd(totalCostUsd)}`,
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
    totalCostUsd,
  };
}

/** Builds the compact agent chat usage label shown beside model controls. */
export function buildAgentChatUsageSummaryLabel(
  messages: AgentMessage[],
  currentModel: AgentModel | null,
): string | null {
  return buildAgentChatUsageSummary(messages, currentModel)?.label ?? null;
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
): Omit<
  AgentChatUsageSummary,
  "label" | "contextTokens" | "contextWindow" | "contextPercent" | "cacheRatePercent" | "totalCostUsd"
> {
  return messages.reduce(
    (totals, message) => {
      if (message.role !== "assistant" || !message.usage) {
        return totals;
      }

      totals.inputTokens += message.usage.input ?? 0;
      totals.outputTokens += message.usage.output ?? 0;
      totals.cacheReadTokens += message.usage.cacheRead ?? 0;
      totals.cacheWriteTokens += message.usage.cacheWrite ?? 0;
      totals.reasoningTokens += message.usage.reasoning ?? 0;
      totals.totalSessionTokens += getUsageTotalTokens(message.usage);
      return totals;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalSessionTokens: 0,
    },
  );
}

function calculateCacheRatePercent(inputTokens: number, cacheReadTokens: number): number {
  const totalCacheableTokens = inputTokens + cacheReadTokens;
  if (totalCacheableTokens <= 0) {
    return 0;
  }

  return Math.round((cacheReadTokens / totalCacheableTokens) * 100);
}

function sumAgentChatCostUsd(messages: AgentMessage[]): number {
  return messages.reduce((totalCost, message) => {
    if (message.role !== "assistant") {
      return totalCost;
    }

    return totalCost + (message.usage?.cost?.total ?? 0);
  }, 0);
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

function formatCompactTokenCount(tokenCount: number): string {
  const roundedTokenCount = Math.max(0, Math.round(tokenCount));
  if (roundedTokenCount >= 1_000_000) {
    return formatCompactTokenSuffix(roundedTokenCount / 1_000_000, "M");
  }

  if (roundedTokenCount >= 1_000) {
    return formatCompactTokenSuffix(roundedTokenCount / 1_000, "K");
  }

  return String(roundedTokenCount);
}

function formatCompactTokenSuffix(value: number, suffix: "K" | "M"): string {
  const roundedValue = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const compactValue = Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(1);
  return `${compactValue}${suffix}`;
}

/** Formats one token count for detailed tooltip display. */
export function formatDetailedTokenCount(tokenCount: number): string {
  const roundedTokenCount = Math.max(0, Math.round(tokenCount));
  if (roundedTokenCount >= 1_000) {
    return formatCompactTokenCount(roundedTokenCount);
  }

  return tokenCountFormatter.format(roundedTokenCount);
}

function formatUsd(value: number): string {
  return usdFormatter.format(value);
}
