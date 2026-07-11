// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage as AgentMessageType } from "../../store/agentChatTypes";
import { AgentMessage } from "./AgentMessage";

vi.mock("./AgentMarkdownContent", () => ({
  AgentMarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("./AgentToolCallCard", () => ({
  AgentToolCallCard: () => <div />,
}));

afterEach(() => {
  cleanup();
});

function buildAssistantThinkingMessage(): AgentMessageType {
  return {
    id: "assistant-1",
    role: "assistant",
    content: [{ type: "thinking", thinking: "working" }],
  };
}

describe("AgentMessage", () => {
  it("shows Thinking while the assistant message is still streaming", () => {
    render(<AgentMessage message={buildAssistantThinkingMessage()} isStreaming />);

    expect(screen.getByText("Thinking")).toBeTruthy();
  });

  it("shows Thought after the assistant message is complete", () => {
    render(<AgentMessage message={buildAssistantThinkingMessage()} />);

    expect(screen.getByText("Thought")).toBeTruthy();
  });
});
