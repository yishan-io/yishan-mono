import type { TokenUsageCostSource, TokenUsageHourlyRow } from "@/store/types";

const COUNTER_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cachedInputTokens",
  "cachedWriteTokens",
  "reasoningTokens",
  "totalTokens",
  "totalCostMicrosUsd",
  "eventCount",
  "sessionCount",
  "turnCount",
  "toolCallCount",
] as const;

export function costSourcePriority(source: TokenUsageCostSource): number {
  switch (source) {
    case "direct":
      return 3;
    case "estimated":
      return 2;
    default:
      return 1;
  }
}

export function normalizeRow(row: TokenUsageHourlyRow): TokenUsageHourlyRow {
  return {
    ...row,
    bucketStartHourUtc: new Date(row.bucketStartHourUtc).toISOString(),
    totalCostMicrosUsd: row.totalCostMicrosUsd ?? 0,
    costSource: row.costSource ?? "unknown",
  };
}

export function rowKey(row: TokenUsageHourlyRow): string {
  return [row.projectId, row.workspaceId, row.agentKind, row.modelNormalized, row.bucketStartHourUtc].join("|");
}

/** True when the already-stored row must keep its counters over the incoming row. */
function existingWins(existing: TokenUsageHourlyRow, incoming: TokenUsageHourlyRow): boolean {
  if (existing.totalTokens !== incoming.totalTokens) {
    return existing.totalTokens > incoming.totalTokens;
  }
  const existingPriority = costSourcePriority(existing.costSource);
  if (existingPriority !== costSourcePriority(incoming.costSource)) {
    return existingPriority > costSourcePriority(incoming.costSource);
  }
  return (
    existing.costSource === incoming.costSource &&
    existing.costSource === "estimated" &&
    incoming.totalCostMicrosUsd === 0 &&
    existing.totalCostMicrosUsd > 0
  );
}

/**
 * Max-wins merge of one stored row with one incoming row (port of the SQL CASE
 * expressions): larger total_tokens wins, then cost_source priority, and an
 * estimated cost is never overwritten by 0. Metadata (path, model, attribution,
 * ingestedAt, runId) always comes from the incoming row.
 */
export function mergeRow(existing: TokenUsageHourlyRow, incoming: TokenUsageHourlyRow): TokenUsageHourlyRow {
  const counters = existingWins(existing, incoming) ? existing : incoming;
  const merged = { ...incoming };
  for (const field of COUNTER_FIELDS) {
    merged[field] = counters[field];
  }
  merged.costSource = counters.costSource;
  return merged;
}

/** Sums rows sharing a key inside one batch (same rule as the SQL service's dedupe). */
export function dedupeRows(rows: TokenUsageHourlyRow[]): TokenUsageHourlyRow[] {
  const byKey = new Map<string, TokenUsageHourlyRow>();
  for (const original of rows) {
    const row = normalizeRow(original);
    const key = rowKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    for (const field of COUNTER_FIELDS) {
      existing[field] += row[field];
    }
    if (costSourcePriority(row.costSource) > costSourcePriority(existing.costSource)) {
      existing.costSource = row.costSource;
    }
    if (new Date(row.ingestedAt) > new Date(existing.ingestedAt)) {
      existing.workspacePath = row.workspacePath;
      existing.model = row.model;
      existing.attributionConfidence = row.attributionConfidence;
      existing.ingestedAt = row.ingestedAt;
      existing.runId = row.runId;
    }
  }
  return [...byKey.values()];
}

/** Merges incoming rows into stored rows; returns the new row list. */
export function mergeRows(stored: TokenUsageHourlyRow[], incoming: TokenUsageHourlyRow[]): TokenUsageHourlyRow[] {
  const byKey = new Map(stored.map((row) => [rowKey(row), row] as const));
  for (const row of dedupeRows(incoming)) {
    const key = rowKey(row);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeRow(existing, row) : row);
  }
  return [...byKey.values()];
}
