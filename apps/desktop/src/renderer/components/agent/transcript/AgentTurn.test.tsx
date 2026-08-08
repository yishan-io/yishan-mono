// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../../store/agentChatTypes";
import { AgentTurn } from "./AgentTurn";
import { type TurnItem, buildTranscriptRows } from "./turnModel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const translations: Record<string, string> = {
        "agentChat.turn.working": "working…",
        "agentChat.turn.worked": "Worked {{duration}}",
      };
      const template = translations[key] ?? key;
      return Object.entries(options ?? {}).reduce((acc, [name, value]) => acc.replace(`{{${name}}}`, value), template);
    },
  }),
}));

vi.mock("./AgentMarkdownContent", () => ({
  AgentMarkdownContent: ({ content }: { content: string }) => <div data-testid="markdown-content">{content}</div>,
}));

vi.mock("./ThinkingBlock", () => ({
  ThinkingBlock: ({ thinking }: { thinking: string }) => <div data-testid="summary-thinking">{thinking}</div>,
}));

vi.mock("./ToolResultMessageContent", () => ({
  ToolResultMessageContent: ({ message }: { message: AgentMessage }) => (
    <div data-testid="tool-result-content">{message.id}</div>
  ),
}));

vi.mock("../tool-calls/AgentToolCallGroup", () => ({
  AgentToolCallGroup: ({
    blocks,
    isTurnWorking,
  }: {
    blocks: { kind: "thinking" | "toolCall"; id: string; toolCall?: { id: string } }[];
    isTurnWorking: boolean;
  }) => (
    <div data-testid="tool-call-group">
      <span>
        {blocks.map((block) => (block.kind === "toolCall" ? block.toolCall?.id : `thinking:${block.id}`)).join(",")}
      </span>
      <span>{isTurnWorking ? "working" : "done"}</span>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function assistantMessage(id: string, overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text: `response ${id}` }],
    ...overrides,
  };
}

function thinkingAndSummaryMessage(id: string, summary = "all done"): AgentMessage {
  return {
    id,
    role: "assistant",
    content: [
      { type: "thinking", thinking: "planning…" },
      { type: "text", text: summary },
    ],
  };
}

function toolCallMessage(id: string, toolCallIds: string[]): AgentMessage {
  return {
    id,
    role: "assistant",
    content: toolCallIds.map((toolCallId) => ({
      type: "toolCall" as const,
      id: toolCallId,
      name: "read",
      arguments: { path: "src/a.ts" },
    })),
  };
}

function buildTurn(messages: { message: AgentMessage; isStreaming?: boolean }[]) {
  const items: TurnItem[] = messages.map(({ message, isStreaming = false }) => ({
    message,
    mergedToolResults: {},
    isStreaming,
  }));
  const row = buildTranscriptRows(items)[0];
  if (!row || row.kind !== "turn") {
    throw new Error("expected a turn row");
  }
  return row.turn;
}

describe("AgentTurn", () => {
  it("shows a working title while the turn is still running", () => {
    const turn = buildTurn([{ message: thinkingAndSummaryMessage("w-a1"), isStreaming: true }]);

    render(<AgentTurn turn={turn} />);

    expect(screen.getByText("working…")).toBeTruthy();
    expect(screen.queryByText(/^worked /)).toBeNull();
  });

  it("shows the worked duration title after the turn ends", () => {
    const turn = buildTurn([{ message: assistantMessage("d-a1", { durationMs: 42_000 }) }]);

    render(<AgentTurn turn={turn} />);

    expect(screen.getByText("Worked 42s")).toBeTruthy();
  });

  it("expands by default and collapses the working content on header click", () => {
    const turn = buildTurn([
      {
        message: {
          id: "togg-a1",
          role: "assistant",
          content: [
            { type: "thinking", thinking: "planning…" },
            { type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } },
            { type: "text", text: "summary here" },
          ],
        },
      },
    ]);

    render(<AgentTurn turn={turn} />);

    expect(screen.getByTestId("agent-turn-body")).toBeTruthy();

    fireEvent.click(screen.getByTestId("agent-turn-header"));
    expect(screen.queryByTestId("agent-turn-body")).toBeNull();

    fireEvent.click(screen.getByTestId("agent-turn-header"));
    expect(screen.getByTestId("agent-turn-body")).toBeTruthy();
  });

  it("keeps the summary text visible when the turn is collapsed", () => {
    const turn = buildTurn([
      {
        message: {
          id: "col-a1",
          role: "assistant",
          content: [
            { type: "thinking", thinking: "planning…" },
            { type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } },
            { type: "text", text: "all done" },
          ],
        },
      },
    ]);

    render(<AgentTurn turn={turn} />);

    expect(screen.getByTestId("agent-turn-summary").textContent).toContain("all done");

    fireEvent.click(screen.getByTestId("agent-turn-header"));
    expect(screen.queryByTestId("agent-turn-body")).toBeNull();
    expect(screen.getByTestId("agent-turn-summary").textContent).toContain("all done");
  });

  it("keeps a working turn expanded even when the header is clicked", () => {
    const turn = buildTurn([
      {
        message: {
          id: "wk-a1",
          role: "assistant",
          content: [
            { type: "thinking", thinking: "planning…" },
            { type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } },
            { type: "text", text: "all done" },
          ],
        },
        isStreaming: true,
      },
    ]);

    render(<AgentTurn turn={turn} />);

    fireEvent.click(screen.getByTestId("agent-turn-header"));
    expect(screen.getByTestId("agent-turn-body")).toBeTruthy();
  });

  it("renders the last message thinking with the summary, outside the tool group", () => {
    const turn = buildTurn([
      {
        message: {
          id: "sm-a1",
          role: "assistant",
          content: [{ type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } }],
        },
      },
      {
        message: {
          id: "sm-a2",
          role: "assistant",
          content: [
            { type: "thinking", thinking: "let me compose the answer" },
            { type: "text", text: "here is the answer" },
          ],
        },
      },
    ]);

    render(<AgentTurn turn={turn} />);

    const group = screen.getByTestId("tool-call-group");
    expect(group.textContent).toContain("read-call");
    expect(group.textContent).not.toContain("let me compose");
    expect(screen.getByTestId("summary-thinking").textContent).toBe("let me compose the answer");

    fireEvent.click(screen.getByTestId("agent-turn-header"));
    expect(screen.queryByTestId("tool-call-group")).toBeNull();
    expect(screen.getByTestId("summary-thinking").textContent).toBe("let me compose the answer");
    expect(screen.getByTestId("markdown-content").textContent).toBe("here is the answer");
  });

  it("does not render any user message content", () => {
    const turn = buildTurn([{ message: assistantMessage("um-a1", { durationMs: 1000 }) }]);

    render(<AgentTurn turn={turn} />);

    expect(screen.queryByTestId("user-content")).toBeNull();
  });

  it("renders unmatched tool results via the tool result content renderer", () => {
    const turn = buildTurn([
      { message: assistantMessage("tr-a1", { durationMs: 1000 }) },
      { message: { id: "orphan-result", role: "toolResult", toolCallId: "missing", content: "out" } },
    ]);

    render(<AgentTurn turn={turn} />);

    expect(screen.getByTestId("tool-result-content").textContent).toBe("orphan-result");
  });

  it("passes the full working sequence (thinking + tool calls) to the grouped tool section", () => {
    const turn = buildTurn([
      {
        message: {
          id: "seq-a1",
          role: "assistant",
          content: [
            { type: "thinking", thinking: "check the files" },
            { type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } },
            { type: "toolCall", id: "bash-call", name: "bash", arguments: { command: "bun test" } },
          ],
        },
        isStreaming: true,
      },
      { message: toolCallMessage("seq-a2", ["edit-call"]) },
    ]);

    render(<AgentTurn turn={turn} />);

    const group = screen.getByTestId("tool-call-group");
    expect(group.textContent).toContain("thinking:seq-a1-thinking-0");
    expect(group.textContent).toContain("read-call,bash-call,edit-call");
    expect(group.textContent).toContain("working");
  });

  it("splits tool runs when a normal text message appears in the middle", () => {
    const turn = buildTurn([
      { message: toolCallMessage("sp-a1", ["read-call"]) },
      { message: { id: "sp-a2", role: "assistant", content: [{ type: "text", text: "checking results" }] } },
      { message: toolCallMessage("sp-a3", ["bash-call"]) },
    ]);

    render(<AgentTurn turn={turn} />);

    const groups = screen.getAllByTestId("tool-call-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]?.textContent).toContain("read-call");
    expect(groups[1]?.textContent).toContain("bash-call");
    expect(screen.getByTestId("markdown-content").textContent).toBe("checking results");
  });
});
