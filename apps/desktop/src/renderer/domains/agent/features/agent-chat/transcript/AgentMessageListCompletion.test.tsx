// @vitest-environment jsdom

import { AppThemePreferenceProvider } from "@renderer/domains/settings";
import en from "@renderer/locales/en/agentChat.json";
import zh from "@renderer/locales/zh/agentChat.json";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../../chat/agentChatTypes";
import { normalizeIncomingAgentMessage } from "../../../subscriptions/agentChatInboundMessage";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";
import { AgentMessageList } from "./AgentMessageList";

// jsdom has no measured viewport; render the virtualizer's rows, leaving the actual list and children real.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string | number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), start: index * 180 })),
    getTotalSize: () => count * 180,
    measureElement: () => {},
  }),
}));

afterEach(cleanup);

function notice(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: "completion-1",
    role: "custom",
    display: true,
    customType: "subagent-completion",
    content: "PRIVATE RAW RESULT sessionId=wrong-child /private/result.md",
    details: { version: 1, agentId: "run-1", agentName: "code-reviewer", status: "completed", sessionId: "child-1" },
    ...overrides,
  };
}

async function renderList(
  messages: AgentMessage[],
  language = "en",
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void,
) {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: "en",
    resources: { en: { translation: en }, zh: { translation: zh } },
    interpolation: { escapeValue: false },
  });
  const props = { tabId: "completion-test", isActive: true, messages, onOpenCompletedSubagent };
  const rendered = render(
    <I18nextProvider i18n={i18n}>
      <AppThemePreferenceProvider>
        <AgentMessageList {...props} />
      </AppThemePreferenceProvider>
    </I18nextProvider>,
  );
  return {
    ...rendered,
    rerenderMessages: (next: AgentMessage[], isWorking = false) =>
      rendered.rerender(
        <I18nextProvider i18n={i18n}>
          <AppThemePreferenceProvider>
            <AgentMessageList {...props} messages={next} isWorking={isWorking} isTurnRunning={isWorking} />
          </AppThemePreferenceProvider>
        </I18nextProvider>,
      ),
  };
}

describe("AgentMessageList completion display", () => {
  it.each([
    ["en", "completed", "Completed", "Open sub-agent code-reviewer"],
    ["en", "failed", "Failed", "Open sub-agent code-reviewer"],
    ["en", "cancelled", "Cancelled", "Open sub-agent code-reviewer"],
    ["zh", "completed", "已完成", "打开子代理 code-reviewer"],
    ["zh", "failed", "失败", "打开子代理 code-reviewer"],
    ["zh", "cancelled", "已取消", "打开子代理 code-reviewer"],
  ])(
    "renders role and localized %s/%s, opening the correct terminal child",
    async (language, status, label, accessibleName) => {
      const onOpen = vi.fn();
      const original = notice();
      await renderList([notice({ details: { ...original.details, status } })], language, onOpen);
      const row = screen.getByTestId("subagent-completion-row");
      expect(within(row).getByText("code-reviewer")).toBeTruthy();
      expect(within(row).getByText(label)).toBeTruthy();
      expect(row.textContent).not.toContain("PRIVATE");
      await userEvent.setup().click(within(row).getByRole("button", { name: accessibleName }));
      expect(onOpen).toHaveBeenCalledExactlyOnceWith({
        agentId: "run-1",
        childSessionId: "child-1",
        title: "code-reviewer",
      });
    },
  );

  it.each(["{Enter}", " "])("supports native keyboard activation with %s", async (key) => {
    const onOpen = vi.fn();
    await renderList([notice()], "en", onOpen);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open sub-agent code-reviewer" }));
    await user.keyboard(key);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith({
      agentId: "run-1",
      childSessionId: "child-1",
      title: "code-reviewer",
    });
  });

  it.each(["en", "zh"])(
    "shows unavailable text, not a broken button, without a child session or callback (%s)",
    async (language) => {
      const { sessionId: _sessionId, ...withoutSession } = notice().details ?? {};
      const onOpen = vi.fn();
      const view = await renderList([notice({ details: withoutSession })], language, onOpen);
      const unavailable = language === "en" ? "Record unavailable" : "记录不可用";
      expect(screen.getByText(unavailable)).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
      expect(onOpen).not.toHaveBeenCalled();
      view.unmount();
      await renderList([notice()], language);
      expect(screen.getByText(unavailable)).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it("hides unknown, malformed and display=false custom messages, without a bogus navigation target", async () => {
    const onOpen = vi.fn();
    await renderList(
      [
        notice({ id: "unknown", customType: "unknown" }),
        notice({ id: "hidden", display: false }),
        notice({ id: "malformed", details: {} }),
        notice({ id: "missing-display", display: undefined }),
        notice({ id: "empty-id", details: { ...notice().details, sessionId: "" } }),
      ],
      "en",
      onOpen,
    );
    expect(screen.queryByTestId("subagent-completion-row")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("agent-chat-empty-state")).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders chronological virtual rows for live arrival and normalized history, with one working indicator", async () => {
    const source: AgentMessage[] = [
      { id: "prompt", role: "user", content: "Prompt" },
      { id: "before", role: "assistant", content: [{ type: "text", text: "Before completion" }], durationMs: 500 },
      notice(),
      { id: "after", role: "assistant", content: [{ type: "text", text: "After completion" }] },
    ];
    const view = await renderList(source.slice(0, 2));
    view.rerenderMessages(source.slice(0, 3), true);
    expect(screen.getAllByTestId("subagent-completion-row")).toHaveLength(1);
    expect(screen.getAllByRole("progressbar", { hidden: true })).toHaveLength(1);
    expect(screen.queryByTestId("agent-turn-working-indicator")).toBeNull();
    for (const messages of [source, source.map((message) => normalizeIncomingAgentMessage(message) ?? message)]) {
      view.rerenderMessages(messages);
      const row = screen.getByTestId("subagent-completion-row");
      expect(row.closest("[data-index]")?.getAttribute("data-index")).toBe("2");
      expect(screen.getAllByTestId("agent-turn")).toHaveLength(2);
      await waitFor(() => {
        expect(screen.getByText("Before completion").closest("[data-index]")?.getAttribute("data-index")).toBe("1");
        expect(screen.getByText("After completion").closest("[data-index]")?.getAttribute("data-index")).toBe("3");
      });
      expect(screen.queryByText(/PRIVATE RAW RESULT/)).toBeNull();
    }
  });
});
