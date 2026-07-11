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

    render(<AgentMessageList messages={messages} emptyPrompt="empty" />);

    expect(screen.getAllByTestId("agent-message-row")).toHaveLength(1);
    expect(screen.getByTestId("merged-count-assistant-1").textContent).toBe("1");
    expect(screen.queryByText("tool-result-1")).toBeNull();
  });
});
