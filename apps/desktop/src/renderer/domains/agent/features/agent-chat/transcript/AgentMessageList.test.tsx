// @vitest-environment jsdom
import { displaySettingsStore } from "@renderer/domains/settings";
import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DisplayRow, ToolCardModel, TurnDisplay } from "../../../chat/transcript/presentation.types";
import { AgentMessageList } from "./AgentMessageList";

const render = renderWithAppTheme;
const virtualizerMocks = vi.hoisted(() => ({
  measureElement: vi.fn(),
  useVirtualizer: vi.fn(({ count, getItemKey }: { count: number; getItemKey: (index: number) => string | number }) => ({
    getVirtualItems: () =>
      (count >= 10 ? [0, count - 1] : Array.from({ length: count }, (_, index) => index)).map((index) => ({
        index,
        key: getItemKey(index),
        start: index * 180,
      })),
    getTotalSize: () => count * 180,
    measureElement: virtualizerMocks.measureElement,
  })),
}));
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: virtualizerMocks.useVirtualizer }));
beforeAll(async () => {
  const { initI18n, i18n } = await import("@renderer/i18n");
  await initI18n();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function user(id: string): Extract<DisplayRow, { kind: "user" }> {
  return { kind: "user", id, text: id };
}
const turn: TurnDisplay = {
  id: "turn-layout",
  blocks: [],
  summary: { text: "Answer", thinking: [], isStreaming: false },
  isWorking: true,
  timingContinues: false,
  workedDurationMs: null,
};

describe("AgentMessageList display routing and layout", () => {
  it("retains unmatched and unresolved bodies without inventing success", () => {
    const card: ToolCardModel = {
      kind: "card",
      sessionId: "parent",
      callId: "orphan",
      toolCall: { id: "orphan", name: "read", arguments: {} },
      rendererKind: "generic",
      renderer: { kind: "generic" },
      result: { text: "Unresolved body", isError: true },
      executionState: "unknown",
      presentationState: "unknown",
      isError: true,
      hasResult: true,
      completeness: "unknown",
      isPending: false,
      isLive: false,
      agentStatus: null,
    };
    const rows: DisplayRow[] = [
      {
        kind: "unmatched",
        id: "unmatched",
        source: { id: "source", stability: "stable", origin: "live" },
        toolName: "bash",
        text: "Unmatched body",
        isError: true,
      },
      { kind: "unresolved", id: "unresolved", callId: "orphan", card },
      {
        kind: "unresolved",
        id: "empty",
        callId: "empty",
        card: { ...card, result: null, hasResult: false, isError: false },
      },
    ];
    render(<AgentMessageList tabId="orphan-results" isActive presentation={{ rows }} />);
    expect(screen.getByText("Unmatched body")).toBeTruthy();
    expect(screen.getByText("Unresolved body")).toBeTruthy();
    expect(screen.getAllByText(/read.*unknown/)).toHaveLength(2);
    expect(screen.queryByText(/succeeded|completed/i)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("labels an unknown completion explicitly without a fabricated child target", () => {
    const onOpen = vi.fn();
    render(
      <AgentMessageList
        tabId="unknown-completion"
        isActive
        presentation={{
          rows: [
            {
              kind: "completion",
              id: "completion",
              completion: { agentName: "Reviewer", outcome: "unknown", text: "sessionId=fake-child" },
            },
          ],
        }}
        onOpenCompletedSubagent={onOpen}
      />,
    );
    expect(screen.getByText("Status unknown")).toBeTruthy();
    expect(screen.getByText("Record unavailable")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });
  it("keeps pane-wide scrolling, fixed width, and top alignment", () => {
    displaySettingsStore.setState({ agentChatWidth: "fixed" });
    render(<AgentMessageList tabId="fixed" isActive presentation={{ rows: [user("Prompt")] }} />);
    expect(getComputedStyle(screen.getByTestId("agent-message-scroll-container")).width).toBe("100%");
    const style = getComputedStyle(screen.getByTestId("agent-message-list-content"));
    expect(style.maxWidth).toBe("960px");
    expect(style.marginLeft).toBe("auto");
    expect(style.justifyContent).toBe("flex-start");
  });
  it("renders only measured virtual model rows with model identities", () => {
    const rows: DisplayRow[] = Array.from({ length: 20 }, (_, index) =>
      index === 19 ? { kind: "turn", turn } : user(`user-${index}`),
    );
    render(<AgentMessageList tabId="virtual" isActive presentation={{ rows }} />);
    expect(screen.getByText("user-0").closest("[data-index]")?.getAttribute("data-index")).toBe("0");
    expect(screen.queryByText("user-1")).toBeNull();
    expect(screen.getByTestId("agent-turn").closest("[data-index]")?.getAttribute("data-index")).toBe("19");
    expect(virtualizerMocks.measureElement).toHaveBeenCalled();
    const options = virtualizerMocks.useVirtualizer.mock.calls.at(-1)?.[0];
    expect(options?.getItemKey(0)).toBe("user-0");
    expect(options?.getItemKey(19)).toBe(turn.id);
  });
  it("hides the footer spinner for a working turn, but keeps compaction and pre-chunk feedback", () => {
    const view = render(
      <AgentMessageList tabId="working" isActive presentation={{ rows: [{ kind: "turn", turn }] }} isWorking />,
    );
    expect(screen.queryByTestId("agent-turn-working-indicator")).toBeNull();
    view.rerender(
      <AgentMessageList
        tabId="working"
        isActive
        presentation={{ rows: [user("Prompt")] }}
        isWorking
        workingLabel="Compacting"
      />,
    );
    expect(screen.getByText("Compacting")).toBeTruthy();
    view.rerender(<AgentMessageList tabId="working" isActive presentation={{ rows: [user("Prompt")] }} isWorking />);
    expect(screen.getByText("working…")).toBeTruthy();
  });
  it("keeps queue-only content and empty help gating", () => {
    const view = render(
      <AgentMessageList
        tabId="empty"
        isActive
        presentation={{ rows: [] }}
        emptyHelpLines={["Tip one", "Tip two"]}
        emptyHelpPrefix="Hint"
      />,
    );
    expect(screen.getAllByTestId("agent-chat-empty-help")).toHaveLength(1);
    expect(screen.getByTestId("agent-chat-empty-help").textContent).toMatch(/^Hint Tip (one|two)$/);
    view.rerender(
      <AgentMessageList
        tabId="empty"
        isActive
        presentation={{ rows: [] }}
        queuedMessages={{ steering: ["queued steering"], followUp: ["queued followup"] }}
      />,
    );
    expect(screen.queryByTestId("agent-chat-empty-state")).toBeNull();
    expect(screen.getByText("queued steering")).toBeTruthy();
    expect(screen.getByText("queued followup")).toBeTruthy();
    view.rerender(
      <AgentMessageList
        tabId="empty"
        isActive
        presentation={{ rows: [] }}
        queuedMessages={{ steering: [], followUp: [] }}
      />,
    );
    expect(screen.getByTestId("agent-chat-empty-state")).toBeTruthy();
  });
  it("follows same-row content growth only while pinned", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const view = render(<AgentMessageList tabId="growth" isActive presentation={{ rows: [user("grow")] }} />);
    const element = screen.getByTestId("agent-message-scroll-container");
    Object.defineProperties(element, {
      clientHeight: { value: 80, configurable: true },
      scrollHeight: { value: 400, configurable: true },
      scrollTop: { value: 320, writable: true, configurable: true },
    });
    Object.defineProperty(element, "scrollHeight", { value: 500, configurable: true });
    view.rerender(
      <AgentMessageList tabId="growth" isActive presentation={{ rows: [{ ...user("grow"), text: "Grown" }] }} />,
    );
    expect(element.scrollTop).toBe(500);
    fireEvent.scroll(element); // consume the programmatic scroll
    element.scrollTop = 20;
    fireEvent.scroll(element);
    view.rerender(
      <AgentMessageList tabId="growth" isActive presentation={{ rows: [{ ...user("grow"), text: "Grown again" }] }} />,
    );
    expect(element.scrollTop).toBe(20);
  });
  it("keeps a manually scrolled transcript position when messages arrive", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const initialMessages = [user("first"), user("second")];
    const { rerender } = render(
      <AgentMessageList tabId="tab-manual-scroll" isActive presentation={{ rows: initialMessages }} />,
    );
    const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { value: 80, configurable: true },
      scrollHeight: { value: 160, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true },
    });
    // The user scrolls to the top of the transcript (away from the bottom).
    fireEvent.scroll(scrollContainer);

    rerender(
      <AgentMessageList
        tabId="tab-manual-scroll"
        isActive
        presentation={{ rows: [...initialMessages, user("third")] }}
      />,
    );

    expect(scrollContainer.scrollTop).toBe(0);
  });

  it("keeps following the stream after switching back to a pinned tab (programmatic scroll must not poison the pin)", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const initialMessages = [user("first"), user("second")];
    const thirdMessage = user("thirdMessage");
    const fourthMessage = user("fourthMessage");

    const { rerender } = render(
      <AgentMessageList tabId="tab-switch-back" isActive={false} presentation={{ rows: initialMessages }} />,
    );

    const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { value: 80, configurable: true },
      scrollHeight: { value: 1000, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true },
    });

    // Content arrives while the tab is still inactive: the hidden surface must
    // not scroll (the activation scroll on switch-back handles it).
    rerender(
      <AgentMessageList
        tabId="tab-switch-back"
        isActive={false}
        presentation={{ rows: [...initialMessages, thirdMessage] }}
      />,
    );
    expect(scrollContainer.scrollTop).toBe(0);

    // Switch back: the activation scroll lands at the (estimated) bottom.
    rerender(
      <AgentMessageList tabId="tab-switch-back" isActive presentation={{ rows: [...initialMessages, thirdMessage] }} />,
    );
    expect(scrollContainer.scrollTop).toBe(1000);

    // The browser dispatches the scroll event for the programmatic scroll; in
    // the meantime the virtualizer re-measures the newly visible rows and the
    // true bottom grows beyond the estimate.
    Object.defineProperty(scrollContainer, "scrollHeight", { value: 1300, configurable: true });
    fireEvent.scroll(scrollContainer);

    // A new message arrives while the tab is active and pinned.
    rerender(
      <AgentMessageList
        tabId="tab-switch-back"
        isActive
        presentation={{ rows: [...initialMessages, thirdMessage, fourthMessage] }}
      />,
    );

    // The pin must survive the programmatic scroll event; the list re-scrolls
    // to the true bottom instead of staying short and scrolled up.
    expect(scrollContainer.scrollTop).toBe(1300);
  });

  it("does not treat the first user scroll after a no-op activation scroll as programmatic", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const messages = [user("first"), user("second")];

    const { rerender } = render(
      <AgentMessageList tabId="tab-noop-activation" isActive={false} presentation={{ rows: messages }} />,
    );

    const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { value: 80, configurable: true },
      scrollHeight: { value: 400, configurable: true },
      // Already at the bottom (max = 400 - 80): the activation scroll is a no-op,
      // so a real browser would not dispatch a scroll event for it.
      scrollTop: { value: 320, writable: true, configurable: true },
    });

    // Switch back while already at the bottom: the activation scroll must not
    // leave a programmatic marker behind for the next user scroll.
    rerender(<AgentMessageList tabId="tab-noop-activation" isActive presentation={{ rows: messages }} />);
    expect(scrollContainer.scrollTop).toBe(320);

    // The user scrolls up; this must be evaluated as a user scroll (pinned=false).
    Object.defineProperty(scrollContainer, "scrollTop", { value: 200, writable: true, configurable: true });
    fireEvent.scroll(scrollContainer);

    // A message arriving while the user is away from the bottom must not yank
    // the view back to the bottom.
    rerender(
      <AgentMessageList tabId="tab-noop-activation" isActive presentation={{ rows: [...messages, user("third")] }} />,
    );

    expect(scrollContainer.scrollTop).toBe(200);
  });

  it("scrolls to keep the working indicator visible when it appears on a pinned list", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const messages = [user("first"), user("second")];

    const { rerender } = render(<AgentMessageList tabId="tab-scroll" isActive presentation={{ rows: messages }} />);

    const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { value: 80, configurable: true },
      scrollHeight: { value: 120, configurable: true },
      scrollTop: { value: 40, writable: true, configurable: true },
    });

    Object.defineProperty(scrollContainer, "scrollHeight", { value: 160, configurable: true });

    rerender(<AgentMessageList tabId="tab-scroll" isActive presentation={{ rows: messages }} isWorking />);

    expect(scrollContainer.scrollTop).toBe(160);
  });

  describe("scroll-to-bottom button", () => {
    it("is hidden when the scroll position is at or near the bottom", () => {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
      vi.stubGlobal("cancelAnimationFrame", vi.fn());

      const messages = [user("first"), user("second")];

      render(<AgentMessageList tabId="tab-scroll-btn-hidden" isActive presentation={{ rows: messages }} />);

      const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
      Object.defineProperties(scrollContainer, {
        clientHeight: { value: 400, configurable: true },
        scrollHeight: { value: 420, configurable: true },
        scrollTop: { value: 20, writable: true, configurable: true },
      });
      fireEvent.scroll(scrollContainer);

      expect(screen.queryByTestId("scroll-to-bottom-button")).toBeNull();
    });

    it("appears when scrolled up away from the bottom", () => {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
      vi.stubGlobal("cancelAnimationFrame", vi.fn());

      const messages = [user("first"), user("second")];

      render(<AgentMessageList tabId="tab-scroll-btn-visible" isActive presentation={{ rows: messages }} />);

      const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
      Object.defineProperties(scrollContainer, {
        clientHeight: { value: 80, configurable: true },
        scrollHeight: { value: 400, configurable: true },
        scrollTop: { value: 50, writable: true, configurable: true },
      });
      fireEvent.scroll(scrollContainer);

      expect(screen.getByTestId("scroll-to-bottom-button")).toBeTruthy();
    });

    it("scrolls to bottom when clicked and keeps following while pinned", () => {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
      vi.stubGlobal("cancelAnimationFrame", vi.fn());

      const messages = [user("first"), user("second")];

      const { rerender } = render(
        <AgentMessageList tabId="tab-scroll-btn-click" isActive presentation={{ rows: messages }} />,
      );

      const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
      Object.defineProperties(scrollContainer, {
        clientHeight: { value: 80, configurable: true },
        scrollHeight: { value: 400, configurable: true },
        scrollTop: { value: 50, writable: true, configurable: true },
      });
      fireEvent.scroll(scrollContainer);

      const button = screen.getByTestId("scroll-to-bottom-button");
      fireEvent.click(button);

      expect(scrollContainer.scrollTop).toBe(400);
      expect(screen.queryByTestId("scroll-to-bottom-button")).toBeNull();

      // The click re-pins: content arriving while pinned keeps the list at the bottom.
      Object.defineProperty(scrollContainer, "scrollHeight", { value: 500, configurable: true });
      rerender(
        <AgentMessageList
          tabId="tab-scroll-btn-click"
          isActive
          presentation={{ rows: [...messages, user("third")] }}
        />,
      );
      expect(scrollContainer.scrollTop).toBe(500);
    });

    it("hides when scrolled back to bottom manually", () => {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
      vi.stubGlobal("cancelAnimationFrame", vi.fn());

      const messages = [user("first"), user("second")];

      render(<AgentMessageList tabId="tab-scroll-manual-back" isActive presentation={{ rows: messages }} />);

      const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
      Object.defineProperties(scrollContainer, {
        clientHeight: { value: 80, configurable: true },
        scrollHeight: { value: 400, configurable: true },
        scrollTop: { value: 50, writable: true, configurable: true },
      });
      fireEvent.scroll(scrollContainer);
      expect(screen.getByTestId("scroll-to-bottom-button")).toBeTruthy();

      Object.defineProperty(scrollContainer, "scrollTop", { value: 380, writable: true, configurable: true });
      fireEvent.scroll(scrollContainer);
      expect(screen.queryByTestId("scroll-to-bottom-button")).toBeNull();
    });

    it("is not rendered when there are no messages", () => {
      render(<AgentMessageList tabId="tab-scroll-btn-empty" isActive presentation={{ rows: [] }} />);

      expect(screen.queryByTestId("scroll-to-bottom-button")).toBeNull();
    });
  });
});
