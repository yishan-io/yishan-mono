// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage as AgentMessageType } from "../../../store/agentChatTypes";
import { AgentMessageList } from "./AgentMessageList";

vi.mock("./AgentMessage", () => ({
  AgentMessage: ({
    message,
    mergedToolResults,
  }: {
    message: AgentMessageType;
    mergedToolResults: Record<string, AgentMessageType | undefined>;
  }) => (
    <div data-testid="agent-message-row">
      <span>{message.id}</span>
      <span data-testid={`merged-count-${message.id}`}>{Object.keys(mergedToolResults).length}</span>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AgentMessageList", () => {
  it.each(["write", "memory_search", "memory_store", "grep", "Agent"] as const)(
    "merges %s tool results into the preceding assistant tool call",
    (toolName) => {
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

      render(<AgentMessageList tabId="tab-1" isActive messages={messages} emptyPrompt="empty" />);

      expect(screen.getAllByTestId("agent-message-row")).toHaveLength(1);
      expect(screen.getByTestId("merged-count-assistant-1").textContent).toBe("1");
      expect(screen.queryByText("tool-result-1")).toBeNull();
    },
  );

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
        emptyPrompt="empty"
      />,
    );

    expect(screen.queryByText("assistant-error")).toBeNull();
    expect(screen.getByText("empty")).toBeTruthy();
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
        emptyPrompt="empty"
      />,
    );

    expect(screen.queryByText("custom-hidden-1")).toBeNull();
    expect(screen.queryByText("custom-hidden-memory")).toBeNull();
    expect(screen.getByText("empty")).toBeTruthy();
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
        emptyPrompt="empty"
        isWorking
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
      <AgentMessageList tabId="tab-manual-scroll" isActive messages={initialMessages} emptyPrompt="empty" />,
    );
    const scrollContainer = container.firstElementChild as HTMLDivElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { value: 80, configurable: true },
      scrollHeight: { value: 160, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true },
    });
    fireEvent.scroll(scrollContainer);

    rerender(
      <AgentMessageList
        tabId="tab-manual-scroll"
        isActive
        messages={[
          ...initialMessages,
          { id: "assistant-2", role: "assistant", content: [{ type: "text", text: "Second" }] },
        ]}
        emptyPrompt="empty"
      />,
    );

    expect(scrollContainer.scrollTop).toBe(0);
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

    const { container, rerender } = render(
      <AgentMessageList tabId="tab-scroll" isActive messages={messages} emptyPrompt="empty" />,
    );

    const scrollContainer = container.firstElementChild as HTMLDivElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { value: 80, configurable: true },
      scrollHeight: { value: 120, configurable: true },
      scrollTop: { value: 40, writable: true, configurable: true },
    });

    Object.defineProperty(scrollContainer, "scrollHeight", { value: 160, configurable: true });

    rerender(<AgentMessageList tabId="tab-scroll" isActive messages={messages} emptyPrompt="empty" isWorking />);

    expect(scrollContainer.scrollTop).toBe(160);
  });
});
