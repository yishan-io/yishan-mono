// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../../store/agentChatTypes";
import type { TurnWorkingBlock } from "../transcript/turnModel";
import { AgentToolCallGroup } from "./AgentToolCallGroup";

vi.mock("../transcript/ThinkingBlock", () => ({
  ThinkingBlock: ({ thinking }: { thinking: string }) => <div data-testid="thinking-block">{thinking}</div>,
}));

vi.mock("./AgentToolCallCard", () => ({
  AgentToolCallCard: ({ toolCall }: { toolCall: { id: string } }) => (
    <div data-testid="tool-call-card">{toolCall.id}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function toolCallBlock(id: string, name = "read"): TurnWorkingBlock {
  return {
    kind: "toolCall",
    id,
    toolCall: { id, name, type: "toolCall", arguments: { path: "src/a.ts" } },
    result: null as AgentMessage | null,
    isStreaming: false,
  };
}

function thinkingBlock(id: string, thinking = "thinking"): TurnWorkingBlock {
  return {
    kind: "thinking",
    id,
    thinking,
    isStreaming: false,
  };
}

describe("AgentToolCallGroup", () => {
  it("renders nothing for an empty block list", () => {
    render(<AgentToolCallGroup blocks={[]} isTurnWorking={false} />);

    expect(screen.queryByTestId("agent-tool-call-group")).toBeNull();
  });

  it("shows the Codex-style summary counts in the header", () => {
    render(
      <AgentToolCallGroup
        blocks={[toolCallBlock("r1"), toolCallBlock("r2"), toolCallBlock("b1", "bash")]}
        isTurnWorking={false}
      />,
    );

    expect(screen.getByText("2 files read · 1 command ran")).toBeTruthy();
  });

  it("keeps thinking blocks inside the group alongside their tool calls", () => {
    render(
      <AgentToolCallGroup
        blocks={[thinkingBlock("t1", "check first"), toolCallBlock("r1"), toolCallBlock("b1", "bash")]}
        isTurnWorking={false}
      />,
    );

    fireEvent.click(screen.getByTestId("agent-tool-call-group-header"));

    expect(screen.getByTestId("agent-tool-call-group-body")).toBeTruthy();
    expect(screen.getByTestId("thinking-block").textContent).toBe("check first");
    expect(screen.getAllByTestId("tool-call-card")).toHaveLength(2);
  });

  it("shows only the latest working block while the turn is working and the group is collapsed", () => {
    render(
      <AgentToolCallGroup
        blocks={[thinkingBlock("t1"), toolCallBlock("r1"), toolCallBlock("b1", "bash")]}
        isTurnWorking
      />,
    );

    expect(screen.getByTestId("agent-tool-call-group-latest")).toBeTruthy();
    expect(screen.getByText("b1")).toBeTruthy();
    expect(screen.queryByText("r1")).toBeNull();
    expect(screen.queryByTestId("agent-tool-call-group-body")).toBeNull();
  });

  it("shows only the header when the turn finished and the group is collapsed", () => {
    render(<AgentToolCallGroup blocks={[toolCallBlock("r1"), toolCallBlock("r2")]} isTurnWorking={false} />);

    expect(screen.getByText("2 files read")).toBeTruthy();
    expect(screen.queryByTestId("agent-tool-call-group-latest")).toBeNull();
    expect(screen.queryByTestId("agent-tool-call-group-body")).toBeNull();
  });

  it("expands to reveal every block and collapses again on header click", () => {
    render(<AgentToolCallGroup blocks={[toolCallBlock("r1"), toolCallBlock("b1", "bash")]} isTurnWorking />);

    fireEvent.click(screen.getByTestId("agent-tool-call-group-header"));

    expect(screen.getByTestId("agent-tool-call-group-body")).toBeTruthy();
    expect(screen.getAllByTestId("tool-call-card")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("agent-tool-call-group-header"));
    expect(screen.queryByTestId("agent-tool-call-group-body")).toBeNull();
    expect(screen.getByTestId("agent-tool-call-group-latest")).toBeTruthy();
  });

  it("renders thinking-only turns without group chrome", () => {
    render(<AgentToolCallGroup blocks={[thinkingBlock("t1", "just thinking")]} isTurnWorking={false} />);

    expect(screen.getByTestId("thinking-block").textContent).toBe("just thinking");
    expect(screen.queryByTestId("agent-tool-call-group-header")).toBeNull();
  });
});
