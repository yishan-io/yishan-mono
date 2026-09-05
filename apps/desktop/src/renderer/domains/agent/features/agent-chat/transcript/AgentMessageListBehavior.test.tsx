// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage as AgentMessageType } from "../../../../../domains/agent/chat/agentChatTypes";
import { AgentMessageList } from "./AgentMessageList";

const virtualizerMocks = vi.hoisted(() => ({
  measureElement: vi.fn(),
  useVirtualizer: vi.fn(({ count }: { count: number }) => {
    const indices = count >= 10 ? [0, count - 1] : Array.from({ length: count }, (_, index) => index);
    return {
      getVirtualItems: () => indices.map((index) => ({ index, key: index, start: index * 180 })),
      getTotalSize: () => count * 180,
      measureElement: virtualizerMocks.measureElement,
    };
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: virtualizerMocks.useVirtualizer,
}));

vi.mock("./AgentTurn", () => ({
  AgentTurn: ({
    turn,
  }: {
    turn: {
      id: string;
      items: { message: { id: string }; mergedToolResults: Record<string, AgentMessageType | undefined> }[];
    };
  }) => (
    <div data-testid="agent-turn-row">
      <span>{turn.id}</span>
      {turn.items.map((item) => (
        <span key={item.message.id}>
          {item.message.id}
          <span data-testid={`merged-count-${item.message.id}`}>{Object.keys(item.mergedToolResults).length}</span>
        </span>
      ))}
    </div>
  ),
}));

vi.mock("./QueuedMessageList", () => ({
  QueuedMessageList: ({ steering, followUp }: { steering: string[]; followUp: string[] }) =>
    steering.length + followUp.length > 0 ? <div data-testid="queued-message-list" /> : null,
}));

vi.mock("./UserMessageRow", () => ({
  UserMessageRow: ({ message }: { message: AgentMessageType }) => (
    <div data-testid="user-row">
      <span>{message.id}</span>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AgentMessageList scroll and queue behavior", () => {
  it("shows the bottom working indicator when running but no turn exists yet", () => {
    render(
      <AgentMessageList
        tabId="tab-pre-chunk"
        isActive
        messages={[{ id: "user-1", role: "user", content: "Prompt" }]}
        isWorking
        isTurnRunning
      />,
    );

    expect(screen.getByText("working…")).toBeTruthy();
  });

  it("keeps a manually scrolled transcript position when messages arrive", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const initialMessages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "First" }] },
    ];
    const { rerender } = render(<AgentMessageList tabId="tab-manual-scroll" isActive messages={initialMessages} />);
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
        messages={[
          ...initialMessages,
          { id: "assistant-2", role: "assistant", content: [{ type: "text", text: "Second" }] },
        ]}
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

    const initialMessages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "First" }] },
      { id: "assistant-2", role: "assistant", content: [{ type: "text", text: "Second" }] },
    ];
    const thirdMessage: AgentMessageType = {
      id: "assistant-3",
      role: "assistant",
      content: [{ type: "text", text: "Third" }],
    };
    const fourthMessage: AgentMessageType = {
      id: "assistant-4",
      role: "assistant",
      content: [{ type: "text", text: "Fourth" }],
    };

    const { rerender } = render(
      <AgentMessageList tabId="tab-switch-back" isActive={false} messages={initialMessages} />,
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
      <AgentMessageList tabId="tab-switch-back" isActive={false} messages={[...initialMessages, thirdMessage]} />,
    );
    expect(scrollContainer.scrollTop).toBe(0);

    // Switch back: the activation scroll lands at the (estimated) bottom.
    rerender(<AgentMessageList tabId="tab-switch-back" isActive messages={[...initialMessages, thirdMessage]} />);
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
        messages={[...initialMessages, thirdMessage, fourthMessage]}
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

    const messages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "First" }] },
    ];

    const { rerender } = render(<AgentMessageList tabId="tab-noop-activation" isActive={false} messages={messages} />);

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
    rerender(<AgentMessageList tabId="tab-noop-activation" isActive messages={messages} />);
    expect(scrollContainer.scrollTop).toBe(320);

    // The user scrolls up; this must be evaluated as a user scroll (pinned=false).
    Object.defineProperty(scrollContainer, "scrollTop", { value: 200, writable: true, configurable: true });
    fireEvent.scroll(scrollContainer);

    // A message arriving while the user is away from the bottom must not yank
    // the view back to the bottom.
    rerender(
      <AgentMessageList
        tabId="tab-noop-activation"
        isActive
        messages={[...messages, { id: "assistant-2", role: "assistant", content: [{ type: "text", text: "Second" }] }]}
      />,
    );

    expect(scrollContainer.scrollTop).toBe(200);
  });

  it("scrolls to keep the working indicator visible when it appears on a pinned list", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const messages: AgentMessageType[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: [{ type: "text", text: "Done writing files." }],
      },
    ];

    const { rerender } = render(<AgentMessageList tabId="tab-scroll" isActive messages={messages} />);

    const scrollContainer = screen.getByTestId("agent-message-scroll-container") as HTMLDivElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { value: 80, configurable: true },
      scrollHeight: { value: 120, configurable: true },
      scrollTop: { value: 40, writable: true, configurable: true },
    });

    Object.defineProperty(scrollContainer, "scrollHeight", { value: 160, configurable: true });

    rerender(<AgentMessageList tabId="tab-scroll" isActive messages={messages} isWorking />);

    expect(scrollContainer.scrollTop).toBe(160);
  });

  it("renders queued messages below the message list when queuedMessages is provided", () => {
    const messages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "Hello" }] },
    ];

    render(
      <AgentMessageList
        tabId="tab-q"
        isActive
        messages={messages}
        queuedMessages={{ steering: ["steer me"], followUp: ["follow up"] }}
      />,
    );

    expect(screen.getByTestId("queued-message-list")).toBeTruthy();
  });

  it("renders no queued section when queuedMessages is empty", () => {
    const messages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "Hello" }] },
    ];

    render(
      <AgentMessageList
        tabId="tab-q-empty"
        isActive
        messages={messages}
        queuedMessages={{ steering: [], followUp: [] }}
      />,
    );

    expect(screen.queryByTestId("queued-message-list")).toBeNull();
  });

  it("renders no queued section when queuedMessages is undefined", () => {
    const messages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "Hello" }] },
    ];

    render(<AgentMessageList tabId="tab-q-undef" isActive messages={messages} />);

    expect(screen.queryByTestId("queued-message-list")).toBeNull();
  });

  it("renders queued messages even when the message list is otherwise empty", () => {
    render(
      <AgentMessageList
        tabId="tab-q-only"
        isActive
        messages={[]}
        queuedMessages={{ steering: ["pending message"], followUp: [] }}
      />,
    );

    expect(screen.getByTestId("queued-message-list")).toBeTruthy();
    expect(screen.queryByTestId("agent-chat-empty-state")).toBeNull();
  });
});
