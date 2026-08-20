import { describe, expect, it } from "vitest";
import type { AgentMessage, AgentModel, AgentSessionStats } from "./agentChatTypes";
import {
  buildAgentChatUsageSummary,
  getAgentChatBilledTokenTotal,
  getCompactContextPercent,
  sumAgentChatBilledUsage,
} from "./agentChatUsageSummary";

function buildModel(contextWindow?: number): AgentModel {
  return {
    id: "openai/gpt-5",
    provider: "OpenAI",
    name: "gpt-5",
    contextWindow,
  };
}

function buildAssistantMessage(input: { totalTokens: number; costTotal: number }): AgentMessage {
  return {
    id: `assistant-${input.totalTokens}`,
    role: "assistant",
    content: [{ type: "text", text: "done" }],
    usage: {
      input: input.totalTokens,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: input.totalTokens,
      totalTokens: input.totalTokens,
      cost: {
        total: input.costTotal,
      },
    },
    stopReason: "stop",
  } as AgentMessage;
}

describe("buildAgentChatUsageSummary (desktop8 Phase 29: numeric calculation stays in Model)", () => {
  it("reports zero usage for a fresh session when the model exposes a context window", () => {
    const summary = buildAgentChatUsageSummary([], buildModel(128_000));
    expect(summary?.contextTokens).toBe(0);
    expect(summary?.contextPercent).toBe(0);
    expect(summary?.totalCostUsd).toBe(0);
  });

  it("uses the latest assistant context tokens and sums session cost", () => {
    const messages: AgentMessage[] = [
      buildAssistantMessage({ totalTokens: 40, costTotal: 0.1 }),
      buildAssistantMessage({ totalTokens: 90, costTotal: 0.2 }),
    ];

    const summary = buildAgentChatUsageSummary(messages, buildModel(100));
    expect(summary?.contextTokens).toBe(90);
    expect(summary?.contextPercent).toBe(90);
    expect(summary?.totalCostUsd).toBeCloseTo(0.3, 5);
  });

  it("keeps context percentages to at most one decimal place", () => {
    const messages: AgentMessage[] = [buildAssistantMessage({ totalTokens: 1, costTotal: 0.25 })];

    expect(buildAgentChatUsageSummary(messages, buildModel(64))?.contextPercent).toBe(1.6);
  });

  it("adds an estimated token tail after the latest assistant usage snapshot", () => {
    const messages: AgentMessage[] = [
      buildAssistantMessage({ totalTokens: 80, costTotal: 0.25 }),
      {
        id: "user-1",
        role: "user",
        content: "12345678",
      },
    ] as AgentMessage[];

    expect(buildAgentChatUsageSummary(messages, buildModel(100))?.contextTokens).toBe(82);
  });

  it("ignores assistant thinking text in fallback estimation", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-thinking",
        role: "assistant",
        content: [{ type: "thinking", thinking: "12345678" }],
        stopReason: "stop",
      } as AgentMessage,
    ];

    expect(buildAgentChatUsageSummary(messages, buildModel(100))?.contextTokens).toBe(0);
  });

  it("falls back to legacy usage.total when totalTokens is unavailable", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-legacy-total",
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        usage: {
          input: 80,
          output: 20,
          cacheRead: 0,
          cacheWrite: 0,
          total: 100,
          cost: {
            total: 0.25,
          },
        },
        stopReason: "stop",
      } as AgentMessage,
    ];

    expect(buildAgentChatUsageSummary(messages, buildModel(100))?.contextPercent).toBe(100);
  });

  it("returns null when the current model does not expose a context window", () => {
    expect(buildAgentChatUsageSummary([], buildModel())).toBeNull();
  });

  it("grows the ctx estimate from a streaming assistant message on top of the last usage", () => {
    const messages: AgentMessage[] = [
      buildAssistantMessage({ totalTokens: 80, costTotal: 0.25 }),
      {
        id: "user-1",
        role: "user",
        content: "12345678",
      },
    ] as AgentMessage[];
    const streamingMessage = {
      id: "assistant-streaming",
      role: "assistant",
      content: [{ type: "text", text: "a".repeat(800) }],
    } as AgentMessage;

    // 80 (last usage) + 2 (user tail) + 200 (800 chars / 4) = 282.
    expect(buildAgentChatUsageSummary([...messages, streamingMessage], buildModel(128_000))?.contextTokens).toBe(282);

    const longerStreamingMessage = {
      id: "assistant-streaming",
      role: "assistant",
      content: [{ type: "text", text: "a".repeat(1600) }],
    } as AgentMessage;

    // 80 + 2 + 400 = 482.
    expect(buildAgentChatUsageSummary([...messages, longerStreamingMessage], buildModel(128_000))?.contextTokens).toBe(
      482,
    );
  });

  it("fully char-estimates ctx when no assistant usage exists yet", () => {
    const streamingMessage = {
      id: "assistant-streaming",
      role: "assistant",
      content: [{ type: "text", text: "a".repeat(800) }],
    } as AgentMessage;

    expect(buildAgentChatUsageSummary([streamingMessage], buildModel(128_000))?.contextTokens).toBe(200);
  });

  it("uses four billing fields for session totals when totalTokens is only a context snapshot", () => {
    const billedAssistantMessage = {
      id: "assistant-billed-total",
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      usage: {
        input: 10,
        output: 20,
        cacheRead: 30,
        cacheWrite: 40,
        totalTokens: 999,
        total: 999,
        cost: { total: 0.5 },
      },
      stopReason: "stop",
    } satisfies AgentMessage;
    const messages: AgentMessage[] = [billedAssistantMessage];

    expect(getAgentChatBilledTokenTotal({ input: 10, output: 20, cacheRead: 30, cacheWrite: 40 })).toBe(100);
    expect(
      sumAgentChatBilledUsage([
        { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cost: 0.5 },
        { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: 0.1 },
      ]),
    ).toEqual({ input: 11, output: 22, cacheRead: 33, cacheWrite: 44, cost: 0.6 });
    expect(buildAgentChatUsageSummary(messages, buildModel(1_000))?.totalSessionTokens).toBe(100);
    expect(buildAgentChatUsageSummary(messages, buildModel(1_000))?.contextTokens).toBe(999);
  });

  it("derives the cache rate percent from input + cache-read tokens", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-cache",
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        usage: {
          input: 100,
          output: 0,
          cacheRead: 300,
          cacheWrite: 0,
          total: 400,
          cost: { total: 0 },
        },
        stopReason: "stop",
      } as AgentMessage,
    ];

    expect(buildAgentChatUsageSummary(messages, buildModel(128_000))?.cacheRatePercent).toBe(75);
  });
});

describe("getCompactContextPercent", () => {
  const statsWithPercent = (percent: number): AgentSessionStats => ({
    tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
    cost: 0.5,
    contextUsage: { tokens: 100, contextWindow: 128_000, percent },
  });

  it("prefers the authoritative snapshot percent when present", () => {
    const messages: AgentMessage[] = [buildAssistantMessage({ totalTokens: 80, costTotal: 0.25 })];
    expect(getCompactContextPercent(messages, buildModel(128_000), statsWithPercent(91))).toBe(91);
  });

  it("falls back to the committed-messages estimate when the snapshot is absent", () => {
    const messages: AgentMessage[] = [buildAssistantMessage({ totalTokens: 64_000, costTotal: 0.25 })];
    expect(getCompactContextPercent(messages, buildModel(128_000), null)).toBe(50);
  });

  it("returns 0 when no snapshot and no model context window are available", () => {
    const messages: AgentMessage[] = [buildAssistantMessage({ totalTokens: 64_000, costTotal: 0.25 })];
    expect(getCompactContextPercent(messages, buildModel(), null)).toBe(0);
  });
});
