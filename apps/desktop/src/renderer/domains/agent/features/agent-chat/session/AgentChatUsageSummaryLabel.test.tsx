// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { COLOR_PRIMITIVES } from "@yishan-io/design-tokens/v1";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../../../../domains/agent/chat/agentChatTypes";
import { agentChatStore } from "../../../../../domains/agent/state/agentChatStore";
import { AgentChatUsageSummaryLabel, getUsageSummaryColor } from "./AgentChatUsageSummaryLabel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, replacements?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        "agentChat.usageSummary.currentContext": "Current context",
        "agentChat.usageSummary.contextCompact": "CTX",
        "agentChat.usageSummary.contextUsageButton": "Current context: {{usage}}. Open usage details",
        "agentChat.usageSummary.contextKnown": "{{contextTokens}} of {{contextWindow}} tokens ({{contextPercent}}%)",
        "agentChat.usageSummary.contextUnknown": "unknown of {{contextWindow}} tokens",
        "agentChat.usageSummary.details": "Usage details",
        "agentChat.usageSummary.input": "Input",
        "agentChat.usageSummary.output": "Output",
        "agentChat.usageSummary.cacheRead": "Cache read",
        "agentChat.usageSummary.cacheWrite": "Cache write",
        "agentChat.usageSummary.cacheRate": "Cache rate",
        "agentChat.usageSummary.reasoning": "Reasoning",
        "agentChat.usageSummary.sessionTotalCumulative": "Session total (cumulative)",
        "agentChat.usageSummary.cost": "Cost",
      };
      const translation = translations[key] ?? key;

      return Object.entries(replacements ?? {}).reduce(
        (result, [replacementKey, replacementValue]) => result.replace(`{{${replacementKey}}}`, String(replacementValue)),
        translation,
      );
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
  it("renders a compact context control with a summary tooltip and detailed popover", async () => {
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

    const usageButton = screen.getByRole("button", {
      name: "Current context: 2.2K of 128K tokens (1.7%). Open usage details",
    });
    const usageProgress = within(usageButton).getByTestId("context-usage-progress");
    expect(usageProgress.querySelector(".MuiCircularProgress-track")).toBeTruthy();
    expect(within(usageButton).queryByRole("progressbar")).toBeNull();

    fireEvent.mouseOver(usageButton);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("Current context");
    expect(tooltip.textContent).toContain("2.2K / 128K (1.7%)");
    expect(tooltip.textContent).not.toContain("Input");

    fireEvent.click(usageButton);

    const popover = await screen.findByRole("dialog", { name: "Usage details" });
    expect(popover.textContent).toContain("Input");
    expect(popover.textContent).toContain("2.2K");
    expect(popover.textContent).toContain("Output");
    expect(popover.textContent).toContain("16");
    expect(popover.textContent).toContain("Cache read");
    expect(popover.textContent).toContain("1.5K");
    expect(popover.textContent).toContain("Cache write");
    expect(popover.textContent).toContain("24");
    expect(popover.textContent).toContain("Cache rate");
    expect(popover.textContent).toContain("41%");
    expect(popover.textContent).toContain("Reasoning");
    expect(popover.textContent).toContain("120");
    expect(popover.textContent).toContain("Session total (cumulative)");
    expect(popover.textContent).toContain("Cost");
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

    expect(
      screen.getByRole("button", { name: "Current context: 2.2K of 128K tokens (1.7%). Open usage details" }),
    ).toBeTruthy();
  });

  it("renders the context control immediately after a model with a context window is hydrated", () => {
    seedSession({ currentModelContextWindow: 200_000 });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.getByRole("button", { name: "Current context: 0 of 200K tokens (0%). Open usage details" })).toBeTruthy();
  });

  it("renders nothing when the current model has no context window", () => {
    seedSession({ currentModelContextWindow: undefined });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.queryByRole("button", { name: /Open usage details/ })).toBeNull();
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

    expect(
      screen.getByRole("button", { name: "Current context: 280 of 128K tokens (0.2%). Open usage details" }),
    ).toBeTruthy();

    act(() => {
      store.updateStreamingMessage("tab-1", {
        id: "assistant-streaming",
        role: "assistant",
        content: [{ type: "text", text: "a".repeat(1600) }],
      } as AgentMessage);
    });

    expect(
      screen.getByRole("button", { name: "Current context: 480 of 128K tokens (0.4%). Open usage details" }),
    ).toBeTruthy();
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

    expect(
      screen.getByRole("button", { name: "Current context: 100 of 128K tokens (0.1%). Open usage details" }),
    ).toBeTruthy();
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

    expect(
      screen.getByRole("button", { name: "Current context: 90 of 128K tokens (0.1%). Open usage details" }),
    ).toBeTruthy();
  });

  it("transitions from a settled baseline to live exact-once billing and back to settled stats", async () => {
    seedSession({ currentModelContextWindow: 1_000 });
    const store = agentChatStore.getState();
    const completedChild = {
      id: "completed-child",
      role: "custom" as const,
      customType: "pi-subagent-child" as const,
      content: "",
      details: {
        event: "completed" as const,
        agentId: "child",
        agentName: "Child",
        childSessionId: "child-session",
        usage: { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cost: 0.05 },
      },
    };

    act(() => {
      store.replaceMessages("tab-1", [
        {
          id: "baseline-parent",
          role: "assistant",
          content: [],
          usage: { input: 100, output: 20, cacheRead: 30, cacheWrite: 40, totalTokens: 500, cost: { total: 1 } },
        },
      ]);
      store.setSessionStats("tab-1", {
        tokens: { input: 100, output: 20, cacheRead: 30, cacheWrite: 40, total: 9_999 },
        cost: 1,
        contextUsage: { tokens: 500, contextWindow: 1_000, percent: 50 },
      });
    });
    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);
    expect(
      screen.getByRole("button", { name: "Current context: 500 of 1K tokens (50%). Open usage details" }),
    ).toBeTruthy();

    act(() => {
      store.setSessionStats("tab-1", null);
      store.appendMessage("tab-1", {
        id: "live-parent",
        role: "assistant",
        content: [],
        usage: { input: 7, output: 8, cacheRead: 9, cacheWrite: 10, totalTokens: 600, cost: { total: 0.07 } },
      });
      store.appendMessage("tab-1", completedChild);
      store.appendMessage("tab-1", completedChild);
    });

    const liveLabel = screen.getByRole("button", {
      name: "Current context: 600 of 1K tokens (60%). Open usage details",
    });
    fireEvent.click(liveLabel);
    const usageDetails = await screen.findByRole("dialog", { name: "Usage details" });
    expect(usageDetails.textContent).toContain("109");
    expect(usageDetails.textContent).toContain("31");
    expect(usageDetails.textContent).toContain("43");
    expect(usageDetails.textContent).toContain("55");
    expect(usageDetails.textContent).toContain("238");
    expect(usageDetails.textContent).toContain("$1.12");
    fireEvent.keyDown(usageDetails, { key: "Escape" });

    act(() => {
      store.setSessionStats("tab-1", {
        tokens: { input: 107, output: 28, cacheRead: 39, cacheWrite: 50, total: 99_999 },
        cost: 1.07,
        contextUsage: { tokens: 700, contextWindow: 1_000, percent: 70 },
      });
    });

    const settledLabel = screen.getByRole("button", {
      name: "Current context: 700 of 1K tokens (70%). Open usage details",
    });
    fireEvent.click(settledLabel);
    expect((await screen.findByRole("dialog", { name: "Usage details" })).textContent).toContain("238");
  });

  it("shows the unknown-context placeholder after compaction", () => {
    seedSession({ currentModelContextWindow: 128_000 });
    agentChatStore.getState().setSessionStats("tab-1", {
      tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
      cost: 0.5,
      contextUsage: { tokens: null, contextWindow: 200_000, percent: null },
    });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    const usageButton = screen.getByRole("button", {
      name: "Current context: unknown of 200K tokens. Open usage details",
    });
    expect(within(usageButton).getByTestId("context-usage-progress").getAttribute("aria-valuenow")).toBe("0");
  });

  it("clamps the context circle to 100% while preserving the reported usage", () => {
    seedSession({ currentModelContextWindow: 1_000 });
    agentChatStore.getState().setSessionStats("tab-1", {
      tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
      cost: 0.5,
      contextUsage: { tokens: 1_500, contextWindow: 1_000, percent: 150 },
    });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    const usageButton = screen.getByRole("button", {
      name: "Current context: 1.5K of 1K tokens (150%). Open usage details",
    });
    expect(within(usageButton).getByTestId("context-usage-progress").getAttribute("aria-valuenow")).toBe("100");
  });
});
