// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage as AgentMessageType } from "../../store/agentChatTypes";
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
  it("merges write tool results into the preceding assistant tool call", () => {
    const messages: AgentMessageType[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-write-1",
            name: "write",
            arguments: { path: "src/example.ts" },
          },
        ],
      },
      {
        id: "tool-result-1",
        role: "toolResult",
        toolCallId: "tool-write-1",
        toolName: "write",
        content: "Successfully wrote 10 bytes",
      },
    ];

    render(<AgentMessageList tabId="tab-1" isActive messages={messages} emptyPrompt="empty" />);

    expect(screen.getAllByTestId("agent-message-row")).toHaveLength(1);
    expect(screen.getByTestId("merged-count-assistant-1").textContent).toBe("1");
    expect(screen.queryByText("tool-result-1")).toBeNull();
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
