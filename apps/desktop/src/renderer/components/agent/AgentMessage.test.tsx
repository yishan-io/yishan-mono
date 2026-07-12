// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage as AgentMessageType } from "../../store/agentChatTypes";
import { AgentMessage } from "./AgentMessage";

const mocked = vi.hoisted(() => ({
  agentMarkdownContent: vi.fn(({ content }: { content: string }) => <div>{content}</div>),
}));

vi.mock("./AgentMarkdownContent", () => ({
  AgentMarkdownContent: mocked.agentMarkdownContent,
}));

vi.mock("./AgentToolCallCard", () => ({
  AgentToolCallCard: () => <div />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function buildAssistantThinkingMessage(): AgentMessageType {
  return {
    id: "assistant-1",
    role: "assistant",
    content: [{ type: "thinking", thinking: "working" }],
  };
}

function formatExpectedMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
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

  it("renders streaming assistant text blocks in streaming render mode", () => {
    render(
      <AgentMessage
        message={{
          id: "assistant-text-1",
          role: "assistant",
          content: [{ type: "text", text: "still streaming" }],
        }}
        isStreaming
      />,
    );

    expect(mocked.agentMarkdownContent).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "still streaming",
        renderMode: "streaming",
      }),
      undefined,
    );
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

  it("shows a human-readable timestamp beside assistant duration metadata", () => {
    const timestamp = Date.UTC(2026, 6, 12, 13, 5, 0);

    render(
      <AgentMessage
        message={{
          id: "assistant-metadata-1",
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          timestamp,
          durationMs: 1500,
        }}
      />,
    );

    expect(screen.getByText(formatExpectedMessageTime(timestamp))).toBeTruthy();
    expect(screen.getByText("time took: 1.5s")).toBeTruthy();
  });

  it("shows a human-readable timestamp for non-assistant messages", () => {
    const timestamp = Date.UTC(2026, 6, 12, 13, 6, 0);

    render(
      <AgentMessage
        message={{
          id: "user-timestamp-1",
          role: "user",
          content: "hello",
          timestamp,
        }}
      />,
    );

    expect(screen.getByText(formatExpectedMessageTime(timestamp))).toBeTruthy();
  });
});
