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

describe("AgentMessageList scroll-to-bottom button", () => {
  it("is hidden when the scroll position is at or near the bottom", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const messages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "Hello" }] },
    ];

    render(<AgentMessageList tabId="tab-scroll-btn-hidden" isActive messages={messages} />);

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

    const messages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "Line 1" }] },
      { id: "assistant-2", role: "assistant", content: [{ type: "text", text: "Line 2" }] },
      { id: "assistant-3", role: "assistant", content: [{ type: "text", text: "Line 3" }] },
    ];

    render(<AgentMessageList tabId="tab-scroll-btn-visible" isActive messages={messages} />);

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

    const messages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "Line 1" }] },
      { id: "assistant-2", role: "assistant", content: [{ type: "text", text: "Line 2" }] },
    ];

    const { rerender } = render(<AgentMessageList tabId="tab-scroll-btn-click" isActive messages={messages} />);

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
        messages={[...messages, { id: "assistant-3", role: "assistant", content: [{ type: "text", text: "Line 3" }] }]}
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

    const messages: AgentMessageType[] = [
      { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "Line 1" }] },
      { id: "assistant-2", role: "assistant", content: [{ type: "text", text: "Line 2" }] },
    ];

    render(<AgentMessageList tabId="tab-scroll-manual-back" isActive messages={messages} />);

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
    render(<AgentMessageList tabId="tab-scroll-btn-empty" isActive messages={[]} />);

    expect(screen.queryByTestId("scroll-to-bottom-button")).toBeNull();
  });
});
