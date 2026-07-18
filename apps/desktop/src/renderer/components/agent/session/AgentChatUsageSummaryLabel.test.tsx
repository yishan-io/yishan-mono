// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COLOR_PRIMITIVES } from "@yishan-io/design-tokens/v1";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../../../store/agentChatStore";
import type { AgentMessage } from "../../../store/agentChatTypes";
import { AgentChatUsageSummaryLabel, getUsageSummaryColor } from "./AgentChatUsageSummaryLabel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "agentChat.usageSummary.currentContext": "Current context",
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

    fireEvent.mouseOver(screen.getByLabelText("ctx: 2.2K/128K (2%), $0.25"));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("Current context");
    expect(tooltip.textContent).toContain("2.2K / 128K (2%)");
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

    expect(screen.getByLabelText("ctx: 2.2K/128K (2%), $0.25")).toBeTruthy();
  });

  it("renders nothing when the current model has no context window", () => {
    seedSession({ currentModelContextWindow: undefined });

    render(<AgentChatUsageSummaryLabel tabId="tab-1" />);

    expect(screen.queryByText(/ctx:/i)).toBeNull();
  });
});
