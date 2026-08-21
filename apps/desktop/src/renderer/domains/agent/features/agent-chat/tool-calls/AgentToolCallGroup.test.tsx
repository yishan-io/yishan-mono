// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../../../../domains/agent/chat/agentChatTypes";
import type { TurnWorkingBlock } from "../transcript/turnModel";
import { AgentToolCallGroup, buildLiveHeaderGradient } from "./AgentToolCallGroup";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const count = typeof options?.count === "number" ? String(options.count) : "";
      const toolName = typeof options?.toolName === "string" ? options.toolName : "";
      const translations: Record<string, string> = {
        "agentChat.toolGroup.read_one": "{{count}} file read",
        "agentChat.toolGroup.read_other": "{{count}} files read",
        "agentChat.toolGroup.bash_one": "{{count}} command ran",
        "agentChat.toolGroup.bash_other": "{{count}} commands ran",
        "agentChat.toolGroup.edited_other": "{{count}} files edited",
        "agentChat.toolGroup.searched_other": "{{count}} files searched",
        "agentChat.toolGroup.used_other": "{{count}} {{toolName}} calls",
      };
      const pluralKey = `${key}_${count === "1" ? "one" : "other"}`;
      const template = translations[pluralKey] ?? translations[key] ?? key;
      return template.replace("{{count}}", count).replace("{{toolName}}", toolName);
    },
  }),
}));

vi.mock("../transcript/ThinkingBlock", () => ({
  ThinkingBlock: ({ thinking }: { thinking: string }) => <div data-testid="thinking-block">{thinking}</div>,
}));

vi.mock("./AgentToolCallCard", () => ({
  AgentToolCallCard: ({
    toolCall,
    agentLifecycleState,
  }: {
    toolCall: { id: string };
    agentLifecycleState?: string;
  }) => (
    <div data-testid="tool-call-card">
      {toolCall.id}:{agentLifecycleState}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function toolCallBlock(id: string, name = "read", result: AgentMessage | null = null): TurnWorkingBlock {
  return {
    kind: "toolCall",
    id,
    toolCall: { id, name, type: "toolCall", arguments: { path: "src/a.ts" } },
    result,
    isStreaming: false,
  };
}

function thinkingBlock(id: string, thinking = "thinking", isStreaming = false): TurnWorkingBlock {
  return {
    kind: "thinking",
    id,
    thinking,
    isStreaming,
  };
}

function resultMessage(id: string): AgentMessage {
  return { id, role: "toolResult", toolCallId: id, content: "done" };
}

describe("AgentToolCallGroup", () => {
  it("renders nothing for an empty block list", () => {
    render(<AgentToolCallGroup id="g-empty" blocks={[]} showRunningBlocks={false} />);

    expect(screen.queryByTestId("agent-tool-call-group")).toBeNull();
  });

  it("shows the Codex-style summary counts in the header", () => {
    render(
      <AgentToolCallGroup
        id="g-summary"
        blocks={[toolCallBlock("r1"), toolCallBlock("r2"), toolCallBlock("b1", "bash")]}
        showRunningBlocks={false}
      />,
    );

    expect(screen.getByText("2 files read · 1 command ran")).toBeTruthy();
  });

  it("keeps thinking blocks inside the group alongside their tool calls", () => {
    render(
      <AgentToolCallGroup
        id="g-thinking"
        blocks={[thinkingBlock("t1", "check first"), toolCallBlock("r1"), toolCallBlock("b1", "bash")]}
        showRunningBlocks={false}
      />,
    );

    fireEvent.click(screen.getByTestId("agent-tool-call-group-header"));

    expect(screen.getByTestId("agent-tool-call-group-body")).toBeTruthy();
    expect(screen.getByTestId("thinking-block").textContent).toBe("check first");
    expect(screen.getAllByTestId("tool-call-card")).toHaveLength(2);
  });

  it("shows only the running blocks while the stack is live", () => {
    render(
      <AgentToolCallGroup
        id="g-live"
        blocks={[
          thinkingBlock("t1", "old thought"),
          toolCallBlock("r1", "read", resultMessage("r1-res")),
          toolCallBlock("r2"),
          toolCallBlock("b1", "bash"),
          thinkingBlock("t2", "still thinking", true),
        ]}
        showRunningBlocks
      />,
    );

    const live = screen.getByTestId("agent-tool-call-group-live");
    expect(live.textContent).toContain("r2");
    expect(live.textContent).toContain("b1");
    expect(live.textContent).toContain("still thinking");
    expect(live.textContent).not.toContain("r1");
    expect(live.textContent).not.toContain("old thought");
    expect(screen.queryByTestId("agent-tool-call-group-body")).toBeNull();
  });

  it("shows only the header once the stack is no longer live", () => {
    render(
      <AgentToolCallGroup id="g-done" blocks={[toolCallBlock("r1"), toolCallBlock("r2")]} showRunningBlocks={false} />,
    );

    expect(screen.getByText("2 files read")).toBeTruthy();
    expect(screen.queryByTestId("agent-tool-call-group-live")).toBeNull();
    expect(screen.queryByTestId("agent-tool-call-group-body")).toBeNull();
  });

  it("shows only the summary header when a live stack has no running blocks", () => {
    render(
      <AgentToolCallGroup
        id="g-live-done"
        blocks={[toolCallBlock("r1", "read", resultMessage("r1-res")), thinkingBlock("t1", "done thought")]}
        showRunningBlocks
      />,
    );

    expect(screen.getByText("1 file read")).toBeTruthy();
    expect(screen.queryByTestId("agent-tool-call-group-live")).toBeNull();
    expect(screen.queryByTestId("agent-tool-call-group-body")).toBeNull();
  });

  it("keeps queued and preparing Agent cards visible with their pending badges while omitting completed cards", () => {
    render(
      <AgentToolCallGroup
        id="g-agent-lifecycle"
        blocks={[
          toolCallBlock("agent-queued", "Agent"),
          toolCallBlock("agent-preparing", "Agent"),
          toolCallBlock("agent-running", "Agent"),
          toolCallBlock("agent-completed", "Agent"),
          toolCallBlock("read-running"),
        ]}
        showRunningBlocks
        agentToolCallStates={
          new Map([
            ["agent-queued", "queued"],
            ["agent-preparing", "preparing"],
            ["agent-running", "running"],
            ["agent-completed", "completed"],
          ])
        }
      />,
    );

    const live = screen.getByTestId("agent-tool-call-group-live");
    expect(live.textContent).toContain("agent-queued:queued");
    expect(live.textContent).toContain("agent-preparing:preparing");
    expect(live.textContent).toContain("agent-running:running");
    expect(live.textContent).toContain("read-running:");
    expect(live.textContent).not.toContain("agent-completed");
  });

  it("drops a card from the live stack once its result arrives", () => {
    const { rerender } = render(
      <AgentToolCallGroup
        id="g-result-arrival"
        blocks={[toolCallBlock("r1"), toolCallBlock("b1", "bash")]}
        showRunningBlocks
      />,
    );

    let live = screen.getByTestId("agent-tool-call-group-live");
    expect(live.textContent).toContain("r1");
    expect(live.textContent).toContain("b1");

    rerender(
      <AgentToolCallGroup
        id="g-result-arrival"
        blocks={[toolCallBlock("r1", "read", resultMessage("r1-res")), toolCallBlock("b1", "bash")]}
        showRunningBlocks
      />,
    );

    live = screen.getByTestId("agent-tool-call-group-live");
    expect(live.textContent).not.toContain("r1");
    expect(live.textContent).toContain("b1");
  });

  it("expands to reveal every block and collapses again on header click", () => {
    render(
      <AgentToolCallGroup
        id="g-toggle"
        blocks={[toolCallBlock("r1"), toolCallBlock("b1", "bash")]}
        showRunningBlocks
      />,
    );

    const live = screen.getByTestId("agent-tool-call-group-live");
    expect(live.textContent).toContain("r1");
    expect(live.textContent).toContain("b1");

    fireEvent.click(screen.getByTestId("agent-tool-call-group-header"));

    expect(screen.getByTestId("agent-tool-call-group-body")).toBeTruthy();
    expect(screen.getAllByTestId("tool-call-card")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("agent-tool-call-group-header"));
    expect(screen.queryByTestId("agent-tool-call-group-body")).toBeNull();
    expect(screen.getByTestId("agent-tool-call-group-live")).toBeTruthy();
  });

  it("renders thinking-only turns without group chrome", () => {
    render(
      <AgentToolCallGroup
        id="g-thinking-only"
        blocks={[thinkingBlock("t1", "just thinking")]}
        showRunningBlocks={false}
      />,
    );

    expect(screen.getByTestId("thinking-block").textContent).toBe("just thinking");
    expect(screen.queryByTestId("agent-tool-call-group-header")).toBeNull();
  });

  it("marks the header text as live while the stack has running blocks", () => {
    render(
      <AgentToolCallGroup
        id="g-live-header"
        blocks={[toolCallBlock("r1"), thinkingBlock("t1", "still thinking", true)]}
        showRunningBlocks
      />,
    );

    const headerText = screen.getByTestId("agent-tool-call-group-header-text");
    expect(headerText.textContent).toBe("1 file read");
    expect(screen.getByTestId("agent-tool-call-group-live")).toBeTruthy();
    const liveStyles = getComputedStyle(headerText);
    // jsdom normalizes `transparent` to rgba(0, 0, 0, 0) and does not expand
    // the animation shorthand into animation-name, so assert the shorthand.
    expect(liveStyles.color).toBe("rgba(0, 0, 0, 0)");
    expect(liveStyles.backgroundClip).toBe("text");
    expect(liveStyles.animation).toContain("tool-stack-gradient");
  });

  it("keeps the header text muted when the stack has no running blocks", () => {
    render(
      <AgentToolCallGroup
        id="g-done-header"
        blocks={[toolCallBlock("r1", "read", resultMessage("r1-res"))]}
        showRunningBlocks
      />,
    );

    const headerText = screen.getByTestId("agent-tool-call-group-header-text");
    expect(headerText.textContent).toBe("1 file read");
    const doneStyles = getComputedStyle(headerText);
    expect(doneStyles.color).not.toBe("transparent");
    expect(doneStyles.animation).not.toContain("tool-stack-gradient");
  });

  it("builds a theme-aware animated gradient for the live header", () => {
    expect(buildLiveHeaderGradient("#9f5f06")).toBe("linear-gradient(90deg, #9f5f06, #f0a229, #9f5f06)");
    expect(buildLiveHeaderGradient("#9ddb72")).toBe("linear-gradient(90deg, #9ddb72, #f0a229, #9ddb72)");
  });
});
