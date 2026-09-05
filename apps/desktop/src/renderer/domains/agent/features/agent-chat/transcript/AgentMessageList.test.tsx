// @vitest-environment jsdom

import { displaySettingsStore } from "@renderer/domains/settings";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("AgentMessageList", () => {
  it("keeps the scrollbar's parent pane-wide while constraining fixed-mode transcript content", () => {
    displaySettingsStore.setState({ agentChatWidth: "fixed" });
    const messages: AgentMessageType[] = [{ id: "user-1", role: "user", content: "Prompt" }];

    render(<AgentMessageList tabId="tab-fixed-width" isActive messages={messages} />);

    expect(getComputedStyle(screen.getByTestId("agent-message-scroll-container")).width).toBe("100%");
    expect(getComputedStyle(screen.getByTestId("agent-message-list-content")).maxWidth).toBe("960px");
    expect(getComputedStyle(screen.getByTestId("agent-message-list-content")).marginLeft).toBe("auto");
  });

  it("top-aligns short transcripts", () => {
    const messages: AgentMessageType[] = [{ id: "user-1", role: "user", content: "Prompt" }];

    render(<AgentMessageList tabId="tab-top-alignment" isActive messages={messages} />);

    expect(getComputedStyle(screen.getByTestId("agent-message-list-content")).justifyContent).toBe("flex-start");
  });

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
});
