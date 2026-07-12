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
  it("does not render a duplicate responding spinner for empty streaming assistant messages", () => {
    render(
      <AgentMessage
        message={{
          id: "assistant-empty",
          role: "assistant",
          content: [],
        }}
        isStreaming
      />,
    );

    expect(screen.queryByText("responding…")).toBeNull();
  });

  it("shows Thinking while the assistant message is still streaming", () => {
    render(<AgentMessage message={buildAssistantThinkingMessage()} isStreaming />);

    expect(screen.getByText("Thinking")).toBeTruthy();
  });

  it("shows Thought after the assistant message is complete", () => {
    render(<AgentMessage message={buildAssistantThinkingMessage()} />);

    expect(screen.getByText("Thought")).toBeTruthy();
  });

  it("renders skill-injection user messages as a compact skill marker", () => {
    render(
      <AgentMessage
        message={{
          id: "user-skill-1",
          role: "user",
          content: '<skill name="ys-start" location="/tmp/SKILL.md">\nbody\n</skill>',
        }}
      />,
    );

    expect(screen.getByText(/use skill:/)).toBeTruthy();
    expect(screen.getByText("ys-start")).toBeTruthy();
    expect(screen.queryByText(/location=|body/)).toBeNull();
  });

  it("shows trailing user text after a skill-injection message", () => {
    render(
      <AgentMessage
        message={{
          id: "user-skill-2",
          role: "user",
          content: '<skill name="brainstorm">\nskill body\n</skill>\n\nhow it works',
        }}
      />,
    );

    expect(screen.getByText(/use skill:/)).toBeTruthy();
    expect(screen.getByText("brainstorm")).toBeTruthy();
    expect(screen.getByText("how it works")).toBeTruthy();
    expect(screen.queryByText("skill body")).toBeNull();
  });
});
