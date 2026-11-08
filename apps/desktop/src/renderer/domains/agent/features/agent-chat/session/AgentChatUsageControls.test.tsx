// @vitest-environment jsdom

import { createTheme, ThemeProvider } from "@mui/material/styles";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../../../state/agentChatStore";
import { AgentChatComposerFooter } from "../chat/AgentChatComposerFooter";
import { AgentChatUsageSummaryLabel } from "./AgentChatUsageSummaryLabel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => {
  cleanup();
  agentChatStore.getState().removeSession("usage-tab");
});

function seedUsage(percent: number | null) {
  const store = agentChatStore.getState();
  store.initSession("usage-tab", "usage-session");
  store.setCurrentModel("usage-tab", { id: "model", name: "Model", provider: "test", contextWindow: 1000 });
  store.setSessionState("usage-tab", "idle");
  store.setSessionStats("usage-tab", {
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    contextUsage: { tokens: percent === null ? null : percent * 10, contextWindow: 1000, percent },
  });
}

describe("cumulative token composition", () => {
  const categories = [
    ["input", 100, 10, "primary"],
    ["output", 200, 20, "secondary"],
    ["cacheRead", 300, 30, "success"],
    ["cacheWrite", 400, 40, "warning"],
  ] as const;

  it.each(["light", "dark"] as const)("shows billing proportions and matching legends in %s mode", async (mode) => {
    seedUsage(91);
    const store = agentChatStore.getState();
    store.appendMessage("usage-tab", {
      id: "reasoning",
      role: "assistant",
      content: [],
      usage: { input: 0, output: 200, reasoning: 50 },
    });
    store.setSessionStats("usage-tab", {
      tokens: { input: 100, output: 200, cacheRead: 300, cacheWrite: 400, total: 1000 },
      cost: 0,
      contextUsage: { tokens: 910, contextWindow: 1000, percent: 91 },
    });
    const theme = createTheme({ palette: { mode } });
    render(
      <ThemeProvider theme={theme}>
        <AgentChatUsageSummaryLabel tabId="usage-tab" />
      </ThemeProvider>,
    );
    const button = screen.getByRole("button");
    expect(within(button).getByTestId("context-usage-progress").getAttribute("aria-hidden")).toBe("true");
    fireEvent.mouseOver(button);
    const tooltip = await screen.findByRole("tooltip");
    function assertUsageComposition(surface: HTMLElement) {
      const bar = within(surface).getByRole("img", { name: "agentChat.usageSummary.sessionTotalCumulative" });
      expect(surface.textContent).toContain("agentChat.usageSummary.currentContext");
      expect(surface.textContent).toContain("910 / 1K (91%)");
      expect(surface.textContent).toContain("agentChat.usageSummary.sessionTotalCumulative");
      expect(surface.textContent).toContain("1K");
      expect(bar.children).toHaveLength(4);
      const colors = new Set<string>();
      for (const [key, count, percent, color] of categories) {
        const segment = within(bar).getByLabelText(`agentChat.usageSummary.${key}`);
        expect((segment as HTMLElement).style.width).toBe(`${percent}%`);
        const legend = within(surface).getByText(`${count} (${percent}%)`).parentElement;
        const swatch = legend?.querySelector('[data-testid="token-legend-swatch"]');
        if (!swatch) throw new Error("Missing token legend swatch");
        const expected = document.createElement("span");
        expected.style.backgroundColor = theme.palette[color].main;
        document.body.append(expected);
        const actualColor = getComputedStyle(segment).backgroundColor;
        expect(actualColor).toBe(getComputedStyle(expected).backgroundColor);
        expect(getComputedStyle(swatch).backgroundColor).toBe(actualColor);
        colors.add(actualColor);
        expected.remove();
      }
      expect(colors.size).toBe(4);
    }
    assertUsageComposition(tooltip);
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    assertUsageComposition(dialog);
    expect(dialog.textContent).toContain("agentChat.usageSummary.reasoning");
    expect(dialog.textContent).toContain("50");
  });

  it.each([0, null])("uses a neutral zero-total track independent of context %s", async (contextPercent) => {
    seedUsage(contextPercent);
    render(<AgentChatUsageSummaryLabel tabId="usage-tab" />);
    fireEvent.mouseOver(screen.getByRole("button"));
    const tooltip = await screen.findByRole("tooltip");
    const bar = within(tooltip).getByRole("img", { name: "agentChat.usageSummary.sessionTotalCumulative" });
    expect(getComputedStyle(bar).backgroundColor).toBe(createTheme().palette.divider);
    for (const segment of Array.from(bar.children)) expect((segment as HTMLElement).style.width).toBe("0%");
    expect(within(tooltip).getAllByText("0 (0%)")).toHaveLength(4);
    expect(tooltip.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(tooltip.textContent).toContain(contextPercent === null ? "? / 1K (?)" : "0 / 1K (0%)");
  });
});

describe("Compact in usage details", () => {
  it.each([
    ["idle", false, true, true],
    ["running", false, false, true],
    ["starting", false, false, true],
    ["compacting", false, false, true],
    ["idle", true, false, true],
    ["idle", false, false, false],
  ])("is eligible in %s with pending=%s: %s", async (sessionState, pending, enabled, hasSession) => {
    seedUsage(1);
    const onCompact = vi.fn();
    render(
      <AgentChatComposerFooter
        tabId="usage-tab"
        availableModels={[]}
        currentModel={null}
        thinkingLevel="medium"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
        onAddProvider={vi.fn()}
        sessionState={sessionState}
        canManuallyCompact={hasSession}
        isManualCompactPending={pending}
        isSessionBusy={sessionState !== "idle"}
        draft=""
        attachmentCount={0}
        onCompact={onCompact}
        onAbort={vi.fn()}
        onSubmitButtonClick={vi.fn()}
        onVoiceText={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "agentChat.composer.compact" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "agentChat.usageSummary.contextUsageButton" }));
    const dialog = await screen.findByRole("dialog");
    const button = within(dialog).getByRole<HTMLButtonElement>("button", { name: "agentChat.composer.compact" });
    expect(button.disabled).toBe(!enabled);
    fireEvent.click(button);
    expect(onCompact).toHaveBeenCalledTimes(enabled ? 1 : 0);
  });
});
