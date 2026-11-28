import { dedupeRows, mergeRow, mergeRows } from "@/store/token-usage-merge";
import type { TokenUsageHourlyRow } from "@/store/types";
import { describe, expect, it } from "vitest";

function row(overrides: Partial<TokenUsageHourlyRow> = {}): TokenUsageHourlyRow {
  return {
    projectId: "p",
    workspaceId: "w",
    workspacePath: "/w",
    agentKind: "claude",
    model: "m",
    modelNormalized: "m",
    bucketStartHourUtc: "2026-11-01T10:00:00.000Z",
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    cachedWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 10,
    totalCostMicrosUsd: 0,
    costSource: "unknown",
    eventCount: 1,
    sessionCount: 1,
    turnCount: 1,
    toolCallCount: 0,
    attributionConfidence: "exact",
    ingestedAt: "2026-11-01T11:00:00.000Z",
    runId: "r1",
    ...overrides,
  };
}

describe("mergeRow", () => {
  it("keeps the larger total_tokens", () => {
    const existing = row({ totalTokens: 20, inputTokens: 9 });
    const merged = mergeRow(existing, row({ totalTokens: 10 }));
    expect(merged.totalTokens).toBe(20);
    expect(merged.inputTokens).toBe(9);
    expect(mergeRow(row({ totalTokens: 5 }), row({ totalTokens: 10 })).totalTokens).toBe(10);
  });

  it("breaks ties by cost source priority", () => {
    const existing = row({ costSource: "direct", totalCostMicrosUsd: 7 });
    const merged = mergeRow(existing, row({ costSource: "estimated", totalCostMicrosUsd: 99 }));
    expect(merged.costSource).toBe("direct");
    expect(merged.totalCostMicrosUsd).toBe(7);
    const upgraded = mergeRow(row({ costSource: "unknown" }), row({ costSource: "estimated", totalCostMicrosUsd: 3 }));
    expect(upgraded.costSource).toBe("estimated");
  });

  it("never overwrites an estimated cost with 0", () => {
    const existing = row({ costSource: "estimated", totalCostMicrosUsd: 50 });
    const merged = mergeRow(existing, row({ costSource: "estimated", totalCostMicrosUsd: 0 }));
    expect(merged.totalCostMicrosUsd).toBe(50);
  });

  it("lets a new estimated cost through when nothing stored is positive", () => {
    const existing = row({ costSource: "estimated", totalCostMicrosUsd: 0 });
    expect(mergeRow(existing, row({ costSource: "estimated", totalCostMicrosUsd: 5 })).totalCostMicrosUsd).toBe(5);
  });

  it("always takes metadata from the incoming row", () => {
    const merged = mergeRow(row({ totalTokens: 99 }), row({ runId: "r2", workspacePath: "/new" }));
    expect(merged.runId).toBe("r2");
    expect(merged.workspacePath).toBe("/new");
  });
});

describe("mergeRows", () => {
  it("is idempotent", () => {
    const once = mergeRows([], [row()]);
    expect(mergeRows(once, [row()])).toEqual(once);
  });

  it("keys rows by the conflict fields", () => {
    const merged = mergeRows(
      [row()],
      [row({ workspaceId: "w2" }), row({ bucketStartHourUtc: "2026-11-01T11:00:00Z" })],
    );
    expect(merged).toHaveLength(3);
  });

  it("normalizes equivalent timestamps to one key", () => {
    expect(mergeRows([row()], [row({ bucketStartHourUtc: "2026-11-01T10:00:00Z" })])).toHaveLength(1);
  });

  it("sums duplicates inside one batch", () => {
    const later = row({ totalTokens: 5, costSource: "direct", runId: "r9", ingestedAt: "2026-11-02T00:00:00Z" });
    const [d] = dedupeRows([row({ totalTokens: 10 }), later]);
    expect(d?.totalTokens).toBe(15);
    expect(d?.costSource).toBe("direct");
    expect(d?.runId).toBe("r9");
  });
});
