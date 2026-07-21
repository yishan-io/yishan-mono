import { describe, expect, it } from "vitest";
import type { AgentMessage, AgentModel } from "../../store/agentChatTypes";
import { buildAgentChatUsageSummaryLabel } from "./agentChatUsageSummary";

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

describe("buildAgentChatUsageSummaryLabel", () => {
  it("renders zero usage for a fresh session when the model exposes a context window", () => {
    expect(buildAgentChatUsageSummaryLabel([], buildModel(128_000))).toBe("ctx: 0/128K (0%), $0.00");
  });

  it("uses the latest assistant context tokens and sums session cost", () => {
    const messages: AgentMessage[] = [
      buildAssistantMessage({ totalTokens: 40, costTotal: 0.1 }),
      buildAssistantMessage({ totalTokens: 90, costTotal: 0.2 }),
    ];

    expect(buildAgentChatUsageSummaryLabel(messages, buildModel(100))).toBe("ctx: 90/100 (90%), $0.30");
  });

  it("uses compact k/m units for large context values", () => {
    const messages: AgentMessage[] = [buildAssistantMessage({ totalTokens: 2_206, costTotal: 0.25 })];

    expect(buildAgentChatUsageSummaryLabel(messages, buildModel(128_000))).toBe("ctx: 2.2K/128K (2%), $0.25");
    expect(buildAgentChatUsageSummaryLabel(messages, buildModel(1_500_000))).toBe("ctx: 2.2K/1.5M (0%), $0.25");
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

    expect(buildAgentChatUsageSummaryLabel(messages, buildModel(100))).toBe("ctx: 82/100 (82%), $0.25");
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

    expect(buildAgentChatUsageSummaryLabel(messages, buildModel(100))).toBe("ctx: 0/100 (0%), $0.00");
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

    expect(buildAgentChatUsageSummaryLabel(messages, buildModel(100))).toBe("ctx: 100/100 (100%), $0.25");
  });

  it("returns null when the current model does not expose a context window", () => {
    expect(buildAgentChatUsageSummaryLabel([], buildModel())).toBeNull();
  });
});
