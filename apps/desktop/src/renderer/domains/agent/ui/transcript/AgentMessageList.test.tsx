// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage as AgentMessageType } from "../../../../domains/agent/model/agentChatTypes";
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

describe("AgentMessageList", () => {
  it("renders only virtual rows (standalone user messages and turns) and registers each for dynamic-height measurement", () => {
    const messages = Array.from({ length: 10 }, (_, index): AgentMessageType[] => [
      { id: `user-${index}`, role: "user", content: `Prompt ${index}` },
      { id: `assistant-${index}`, role: "assistant", content: [{ type: "text", text: `Message ${index}` }] },
    ]).flat();

    render(<AgentMessageList tabId="tab-virtual" isActive messages={messages} />);

    expect(screen.getAllByTestId("user-row")).toHaveLength(1);
    expect(screen.getAllByTestId("agent-turn-row")).toHaveLength(1);
    expect(screen.getByText("user-0")).toBeTruthy();
    expect(screen.queryByText("user-1")).toBeNull();
    expect(screen.getByText("user-0").closest("[data-index]")?.getAttribute("data-index")).toBe("0");
    const turnRow = screen.getByTestId("agent-turn-row");
    expect(turnRow.textContent).toContain("assistant-9");
    expect(turnRow.closest("[data-index]")?.getAttribute("data-index")).toBe("19");
  });

  it.each([
    "bash",
    "read",
    "edit",
    "write",
    "grep",
    "Agent",
    "memory_read",
    "memory_search",
    "memory_store",
    "ask_user",
    "web_fetch",
    "workspace_list",
    "workspace_find",
    "workspace_create",
    "workspace_close",
  ] as const)("merges %s tool results into the preceding assistant tool call", (toolName) => {
    const messages: AgentMessageType[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-1",
            name: toolName,
            arguments:
              toolName === "Agent"
                ? {
                    agent: "code-reviewer",
                    prompt: "Review the code quality of the services directory.",
                  }
                : { path: "src/example.ts" },
          },
        ],
      },
      {
        id: "tool-result-1",
        role: "toolResult",
        toolCallId: "tool-1",
        toolName,
        content: "tool result",
      },
    ];

    render(<AgentMessageList tabId="tab-1" isActive messages={messages} />);

    expect(screen.getAllByTestId("agent-turn-row")).toHaveLength(1);
    expect(screen.getByTestId("merged-count-assistant-1").textContent).toBe("1");
    expect(screen.queryByText("tool-result-1")).toBeNull();
  });

  it("associates delayed parallel results by toolCallId across intervening messages", () => {
    const messages: AgentMessageType[] = [
      {
        id: "assistant-tools",
        role: "assistant",
        content: [
          { type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/read.ts" } },
          { type: "toolCall", id: "bash-call", name: "bash", arguments: { command: "echo hi" } },
          { type: "toolCall", id: "custom-call", name: "custom_tool", arguments: { mode: "full" } },
        ],
      },
      { id: "intervening", role: "assistant", content: [{ type: "text", text: "Waiting for results" }] },
      {
        id: "bash-result",
        role: "toolResult",
        toolCallId: "bash-call",
        toolName: "bash",
        content: "bash output",
      },
      {
        id: "read-result",
        role: "toolResult",
        toolCallId: "read-call",
        toolName: "read",
        content: "read output",
      },
      {
        id: "custom-result",
        role: "toolResult",
        toolCallId: "custom-call",
        toolName: "custom_tool",
        content: "custom output",
      },
      {
        id: "duplicate-bash-result",
        role: "toolResult",
        toolCallId: "bash-call",
        toolName: "bash",
        content: "duplicate bash output",
      },
      {
        id: "unmatched-result",
        role: "toolResult",
        toolCallId: "missing-call",
        toolName: "read",
        content: "keep me visible",
      },
    ];

    render(<AgentMessageList tabId="tab-delayed" isActive messages={messages} />);

    expect(screen.getByTestId("merged-count-assistant-tools").textContent).toBe("3");
    expect(screen.getAllByTestId("agent-turn-row")).toHaveLength(1);
    expect(screen.queryByText("bash-result")).toBeNull();
    expect(screen.queryByText("read-result")).toBeNull();
    expect(screen.queryByText("custom-result")).toBeNull();
    expect(screen.getByText("duplicate-bash-result")).toBeTruthy();
    expect(screen.getByText("unmatched-result")).toBeTruthy();
  });

  it("hides assistant error snapshots that have no renderable content", () => {
    render(
      <AgentMessageList
        tabId="tab-error"
        isActive
        messages={[
          {
            id: "assistant-error",
            role: "assistant",
            content: [],
            stopReason: "error",
            errorMessage: "Codex error: The usage limit has been reached",
          },
        ]}
      />,
    );

    expect(screen.queryByText("assistant-error")).toBeNull();
    expect(screen.getByTestId("agent-chat-empty-state")).toBeTruthy();
  });

  it("hides hidden custom messages, including pi-memory-context", () => {
    render(
      <AgentMessageList
        tabId="tab-hidden-custom"
        isActive
        messages={[
          {
            id: "custom-hidden-1",
            role: "custom",
            customType: "some-internal-message",
            display: false,
            content: "hidden",
          },
          {
            id: "custom-hidden-memory",
            role: "custom",
            customType: "pi-memory-context",
            display: false,
            content: "memory",
          },
        ]}
      />,
    );

    expect(screen.queryByText("custom-hidden-1")).toBeNull();
    expect(screen.queryByText("custom-hidden-memory")).toBeNull();
    expect(screen.getByTestId("agent-chat-empty-state")).toBeTruthy();
  });

  it("renders exactly one randomly chosen help line with a prefix in the empty state", () => {
    const helpLines = ["you can @mention files to add context?", "you can use voice input to prompt hands-free?"];
    render(
      <AgentMessageList
        tabId="tab-empty-help"
        isActive
        messages={[]}
        emptyHelpLines={helpLines}
        emptyHelpPrefix="Did you know"
      />,
    );

    const helpElements = screen.getAllByTestId("agent-chat-empty-help");
    expect(helpElements).toHaveLength(1);
    const helpText = helpElements[0]?.textContent ?? "";
    expect(helpText).toMatch(/^Did you know /);
    expect(helpLines).toContain(helpText.replace(/^Did you know /, ""));
  });

  it("shows a help line again when the chat returns to the empty state", () => {
    const helpLines = ["@mention files to add context", "Type / to run skills"];
    const message: AgentMessageType = {
      id: "assistant-1",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
    };
    const { rerender } = render(
      <AgentMessageList tabId="tab-empty-repick" isActive messages={[]} emptyHelpLines={helpLines} />,
    );

    expect(screen.getAllByTestId("agent-chat-empty-help")).toHaveLength(1);

    rerender(<AgentMessageList tabId="tab-empty-repick" isActive messages={[message]} emptyHelpLines={helpLines} />);
    expect(screen.queryAllByTestId("agent-chat-empty-help")).toHaveLength(0);

    rerender(<AgentMessageList tabId="tab-empty-repick" isActive messages={[]} emptyHelpLines={helpLines} />);
    const helpElements = screen.getAllByTestId("agent-chat-empty-help");
    expect(helpElements).toHaveLength(1);
    expect(helpLines).toContain(helpElements[0]?.textContent);
  });

  it("shows a working indicator while the turn is still running without a trailing streaming message", () => {
    render(
      <AgentMessageList
        tabId="tab-1"
        isActive
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "Done writing files." }],
          },
        ]}
        isWorking
      />,
    );

    expect(screen.getByText("working…")).toBeTruthy();
  });

  it("hides the bottom working indicator when a working turn header already shows it", () => {
    render(
      <AgentMessageList
        tabId="tab-working-turn"
        isActive
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "Done writing files." }],
          },
        ]}
        trailingMessage={{
          id: "assistant-streaming",
          role: "assistant",
          content: [{ type: "text", text: "Streaming…" }],
        }}
        isWorking
      />,
    );

    expect(screen.queryByText("working…")).toBeNull();
  });

  it("keeps the bottom indicator hidden while the session is running a turn without a streaming message", () => {
    render(
      <AgentMessageList
        tabId="tab-running-turn"
        isActive
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "Done writing files." }],
          },
        ]}
        isWorking
        isTurnRunning
      />,
    );

    expect(screen.queryByText("working…")).toBeNull();
  });

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
    const { container, rerender } = render(
      <AgentMessageList tabId="tab-manual-scroll" isActive messages={initialMessages} />,
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

    const { container, rerender } = render(<AgentMessageList tabId="tab-scroll" isActive messages={messages} />);

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

  describe("scroll-to-bottom button", () => {
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
          messages={[
            ...messages,
            { id: "assistant-3", role: "assistant", content: [{ type: "text", text: "Line 3" }] },
          ]}
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
});
