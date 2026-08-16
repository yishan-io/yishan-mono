// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COLOR_PRIMITIVES } from "@yishan-io/design-tokens/v1";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../../../features/agent/model/agentChatStore";
import type { AgentMessage } from "../../../features/agent/model/agentChatTypes";
import { AgentChatUsageSummaryLabel, getUsageSummaryColor } from "./AgentChatUsageSummaryLabel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "agentChat.usageSummary.currentContext": "Current context",
        "agentChat.usageSummary.contextCompact": "CTX",
        "agentChat.usageSummary.input": "Input",
        "agentChat.usageSummary.output": "Output",
        "agentChat.usageSummary.cacheRead": "Cache read",
        "agentChat.usageSummary.cacheWrite": "Cache write",
        "agentChat.usageSummary.cacheRate": "Cache rate",
        "agentChat.usageSummary.reasoning": "Reasoning",
        "agentChat.usageSummary.sessionTotalCumulative": "Session total (cumulative)",
        "agentChat.usageSummary.cost": "Cost",
      };

      return translations[key] ?? key;
    },
  }),
}));

function seedSession(input?: { currentModelContextWindow?: number; messages?: AgentMessage[] }): void {
  const store = agentChatStore.getState();
  store.removeSession("tab-1");
  store.initSession("tab-1", "session-1");
  store.setCurrentModel("tab-1", {
    id: "openai/gpt-5",
    provider: "OpenAI",
    name: "gpt-5",
    contextWindow: input?.currentModelContextWindow,
  });

  for (const message of input?.messages ?? []) {
    store.appendMessage("tab-1", message);
  }
}

afterEach(() => {
  cleanup();
  agentChatStore.getState().removeSession("tab-1");
});

describe("getUsageSummaryColor", () => {
  it("uses a darker yellow in light theme and a lighter yellow in dark theme", () => {
    expect(getUsageSummaryColor(70)).toBe("text.disabled");
    expect(getUsageSummaryColor(71, "dark")).toBe(COLOR_PRIMITIVES.brand.amber300);
    expect(getUsageSummaryColor(71, "light")).toBe(COLOR_PRIMITIVES.brand.amber700);
    expect(getUsageSummaryColor(91, "light")).toBe("error.dark");
  });
});

describe("AgentChatUsageSummaryLabel", () => {
  it("shows a usage breakdown popup on hover", async () => {
    seedSession({
      currentModelContextWindow: 128_000,
      messages: [
        {
          id: "assistant-breakdown",
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          usage: {
            input: 2_206,
            output: 16,
            cacheRead: 1_536,
            cacheWrite: 24,
            totalTokens: 2_206,
            reasoning: 120,
            cost: {
              total: 0.25,
            },
          },
          stopReason: "stop",
        } as AgentMessage,
      ],
    });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    fireEvent.mouseOver(screen.getByLabelText("CTX: 2.2K/128K (1.7%), $0.25"));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("Current context");
    expect(tooltip.textContent).toContain("2.2K / 128K (1.7%)");
    expect(tooltip.textContent).toContain("Input");
    expect(tooltip.textContent).toContain("2.2K");
    expect(tooltip.textContent).toContain("Output");
    expect(tooltip.textContent).toContain("16");
    expect(tooltip.textContent).toContain("Cache read");
    expect(tooltip.textContent).toContain("1.5K");
    expect(tooltip.textContent).toContain("Cache write");
    expect(tooltip.textContent).toContain("24");
    expect(tooltip.textContent).toContain("Cache rate");
    expect(tooltip.textContent).toContain("41%");
    expect(tooltip.textContent).toContain("Reasoning");
    expect(tooltip.textContent).toContain("120");
    expect(tooltip.textContent).toContain("Session total (cumulative)");
    expect(tooltip.textContent).toContain("Cost");
  });

  it("renders the derived usage summary for the current tab", () => {
    seedSession({
      currentModelContextWindow: 128_000,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          usage: {
            input: 2_206,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2_206,
            cost: {
              total: 0.25,
            },
          },
          stopReason: "stop",
        } as AgentMessage,
      ],
    });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.getByLabelText("CTX: 2.2K/128K (1.7%), $0.25")).toBeTruthy();
  });

  it("renders nothing when the current model has no context window", () => {
    seedSession({ currentModelContextWindow: undefined });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.queryByText(/CTX:/)).toBeNull();
  });

  it("grows the live ctx estimate while an assistant message streams (sessionStats null)", () => {
    seedSession({
      currentModelContextWindow: 128_000,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          usage: {
            input: 80,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 80,
            cost: {
              total: 0.25,
            },
          },
          stopReason: "stop",
        } as AgentMessage,
      ],
    });

    const store = agentChatStore.getState();
    act(() => {
      store.updateStreamingMessage("tab-1", {
        id: "assistant-streaming",
        role: "assistant",
        content: [{ type: "text", text: "a".repeat(800) }],
      } as AgentMessage);
    });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.getByLabelText("CTX: 280/128K (0.2%), $0.25")).toBeTruthy();

    act(() => {
      store.updateStreamingMessage("tab-1", {
        id: "assistant-streaming",
        role: "assistant",
        content: [{ type: "text", text: "a".repeat(1600) }],
      } as AgentMessage);
    });

    expect(screen.getByLabelText("CTX: 480/128K (0.4%), $0.25")).toBeTruthy();
  });

  it("prefers a stale sessionStats snapshot when one is present (pre-fix freeze documented)", () => {
    // With the turn-start invalidation, sessionStats is null during turns, so this
    // state cannot occur in production anymore. It documents the pre-fix behavior:
    // when a snapshot is present, the label shows it even while a message streams.
    seedSession({
      currentModelContextWindow: 128_000,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          usage: {
            input: 80,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 80,
            cost: {
              total: 0.25,
            },
          },
          stopReason: "stop",
        } as AgentMessage,
      ],
    });
    agentChatStore.getState().setSessionStats("tab-1", {
      tokens: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, total: 100 },
      cost: 0.25,
      contextUsage: { tokens: 100, contextWindow: 128_000, percent: 0.1 },
    });

    agentChatStore.getState().updateStreamingMessage("tab-1", {
      id: "assistant-streaming",
      role: "assistant",
      content: [{ type: "text", text: "a".repeat(800) }],
    } as AgentMessage);

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.getByLabelText("CTX: 100/128K (0.1%), $0.25")).toBeTruthy();
  });

  it("sums cost across completed assistant messages mid-turn", () => {
    seedSession({
      currentModelContextWindow: 128_000,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          usage: {
            input: 40,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 40,
            cost: {
              total: 0.1,
            },
          },
          stopReason: "stop",
        } as AgentMessage,
        {
          id: "assistant-2",
          role: "assistant",
          content: [{ type: "text", text: "done again" }],
          usage: {
            input: 90,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 90,
            cost: {
              total: 0.2,
            },
          },
          stopReason: "stop",
        } as AgentMessage,
      ],
    });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.getByLabelText("CTX: 90/128K (0.1%), $0.30")).toBeTruthy();
  });

  it("shows the unknown-context placeholder after compaction", () => {
    seedSession({ currentModelContextWindow: 128_000 });
    agentChatStore.getState().setSessionStats("tab-1", {
      tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
      cost: 0.5,
      contextUsage: { tokens: null, contextWindow: 200_000, percent: null },
    });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.getByLabelText("CTX: ?/200K (?), $0.50")).toBeTruthy();
  });
});
