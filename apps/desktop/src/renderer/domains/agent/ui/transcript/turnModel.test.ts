import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../../domains/agent/model/agentChatTypes";
import {
  type TranscriptRow,
  type TurnItem,
  buildTranscriptRows,
  buildTurnSections,
  extractTurnSummaryText,
  extractTurnSummaryThinking,
  formatTurnDuration,
  getTurnLiveElapsedMs,
  getTurnWorkedDurationMs,
} from "./turnModel";

function assistantMessage(id: string, overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text: `response ${id}` }],
    ...overrides,
  };
}

function userMessage(id: string, text = `prompt ${id}`, timestamp?: number): AgentMessage {
  return {
    id,
    role: "user",
    content: text,
    ...(timestamp !== undefined ? { timestamp } : {}),
  };
}

function toolResultMessage(id: string, toolCallId: string): AgentMessage {
  return {
    id,
    role: "toolResult",
    toolCallId,
    content: `output ${id}`,
  };
}

function item(message: AgentMessage, isStreaming = false): TurnItem {
  return { message, mergedToolResults: {}, isStreaming };
}

function rowsOf(displayMessages: TurnItem[]): TranscriptRow[] {
  return buildTranscriptRows(displayMessages);
}

function firstTurn(displayMessages: TurnItem[]): Extract<TranscriptRow, { kind: "turn" }> {
  const row = buildTranscriptRows(displayMessages).find((candidate) => candidate.kind === "turn");
  if (!row || row.kind !== "turn") {
    throw new Error("expected a turn row");
  }
  return row;
}

describe("buildTranscriptRows", () => {
  it("renders a user message as a standalone row, never inside a turn", () => {
    const rows = rowsOf([
      item(userMessage("u1")),
      item(assistantMessage("a1")),
      item(userMessage("u2")),
      item(assistantMessage("a2")),
    ]);

    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ kind: "user", message: expect.objectContaining({ id: "u1" }) });
    expect(rows[1]).toMatchObject({ kind: "turn", turn: { id: "a1" } });
    expect(rows[2]).toEqual({ kind: "user", message: expect.objectContaining({ id: "u2" }) });
    expect(rows[3]).toMatchObject({ kind: "turn", turn: { id: "a2" } });
  });

  it("starts a new turn group at each assistant message run", () => {
    const rows = rowsOf([
      item(userMessage("u1")),
      item(assistantMessage("a1")),
      item(assistantMessage("a2")),
      item(userMessage("u2")),
      item(assistantMessage("a3")),
    ]);

    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ kind: "turn", turn: { id: "a1" } });
    const turnRow = rows[1];
    expect(turnRow?.kind === "turn" ? turnRow.turn.items.map((turnItem) => turnItem.message.id) : []).toEqual([
      "a1",
      "a2",
    ]);
    expect(rows[3]).toMatchObject({ kind: "turn", turn: { id: "a3" } });
  });

  it("gives leading assistant messages their own turn (history resume)", () => {
    const rows = rowsOf([item(assistantMessage("a0")), item(userMessage("u1")), item(assistantMessage("a1"))]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "turn", turn: { id: "a0" } });
    expect(rows[1]).toEqual({ kind: "user", message: expect.objectContaining({ id: "u1" }) });
    expect(rows[2]).toMatchObject({ kind: "turn", turn: { id: "a1" } });
  });

  it("keeps unmatched tool results visible inside the current turn", () => {
    const rows = rowsOf([
      item(userMessage("u1")),
      item(assistantMessage("a1")),
      item(toolResultMessage("orphan-result", "missing-call")),
    ]);

    const turnRow = rows[1];
    expect(turnRow?.kind === "turn" ? turnRow.turn.items.map((turnItem) => turnItem.message.id) : []).toEqual([
      "a1",
      "orphan-result",
    ]);
  });

  it("creates a turn for a standalone unmatched tool result", () => {
    const rows = rowsOf([item(toolResultMessage("orphan-result", "missing-call"))]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "turn", turn: { id: "orphan-result" } });
  });

  it("marks the turn working when an item is streaming", () => {
    const rows = rowsOf([item(userMessage("u1")), item(assistantMessage("a1"), true)]);

    const turnRow = rows[1];
    expect(turnRow?.kind === "turn" && turnRow.turn.isWorking).toBe(true);
  });

  it("keeps the last turn working for the whole running session", () => {
    const rows = buildTranscriptRows(
      [item(userMessage("u1")), item(assistantMessage("a1", { durationMs: 1500 }))],
      true,
    );

    const turnRow = rows[1];
    expect(turnRow?.kind === "turn" && turnRow.turn.isWorking).toBe(true);
  });

  it("does not mark a turn working when only a user message is present while running", () => {
    const rows = buildTranscriptRows([item(userMessage("u1"))], true);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("user");
  });

  it("does not mark a previous finished turn working while running", () => {
    const rows = buildTranscriptRows(
      [item(userMessage("u1")), item(assistantMessage("a1", { durationMs: 1500 })), item(userMessage("u2"))],
      true,
    );

    const turnRow = rows[1];
    expect(turnRow?.kind === "turn" && turnRow.turn.isWorking).toBe(false);
  });

  it("captures the turn start from the first assistant item's startedAtMs", () => {
    const rows = buildTranscriptRows(
      [
        item(userMessage("u1")),
        { message: assistantMessage("a1", { startedAtMs: 1_000_000 }), mergedToolResults: {}, isStreaming: true },
        item(assistantMessage("a2", { startedAtMs: 1_050_000 })),
      ],
      true,
    );

    const turnRow = rows[1];
    expect(turnRow?.kind === "turn" ? turnRow.turn.startedAtMs : undefined).toBe(1_000_000);
  });

  it("accumulates durations across the turn's assistant messages", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { durationMs: 1500 })),
      item(assistantMessage("a2", { durationMs: 43000 })),
    ]);

    expect(row.turn.workedDurationMs).toBe(44500);
  });
});

describe("buildTurnSections", () => {
  it("collects thinking and tool calls into one run in original order with merged results", () => {
    const readResult = toolResultMessage("read-result", "read-call");
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "let me check" },
        { type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } },
        { type: "toolCall", id: "bash-call", name: "bash", arguments: { command: "bun test" } },
      ],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [{ type: "text", text: "all done" }],
    };
    const row = firstTurn([
      item(userMessage("u1")),
      { message: a1, mergedToolResults: { "read-call": readResult, "bash-call": undefined }, isStreaming: false },
      item(a2),
    ]);

    const sections = buildTurnSections(row.turn.items, "a2", "all done");

    expect(sections).toHaveLength(1);
    const run = sections[0];
    expect(run?.kind).toBe("toolRun");
    if (run?.kind === "toolRun") {
      expect(
        run.blocks.map((block) => (block.kind === "thinking" ? `thinking:${block.thinking}` : block.toolCall.id)),
      ).toEqual(["thinking:let me check", "read-call", "bash-call"]);
      expect(run.blocks[1]?.kind === "toolCall" && run.blocks[1].result?.id).toBe("read-result");
    }
  });

  it("splits tool runs when a normal text message appears in the middle", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { content: [{ type: "toolCall", id: "read-call", name: "read", arguments: {} }] })),
      item(assistantMessage("a2", { content: [{ type: "text", text: "checking results" }] })),
      item(
        assistantMessage("a3", {
          content: [{ type: "toolCall", id: "bash-call", name: "bash", arguments: {} }],
        }),
      ),
    ]);

    const sections = buildTurnSections(row.turn.items, "a3", null);

    expect(sections.map((section) => section.kind)).toEqual(["toolRun", "text", "toolRun"]);
    const firstRun = sections[0];
    const textSection = sections[1];
    const secondRun = sections[2];
    if (firstRun?.kind === "toolRun") {
      expect(firstRun.blocks[0]?.kind === "toolCall" && firstRun.blocks[0].toolCall.id).toBe("read-call");
    }
    expect(textSection?.kind === "text" && textSection.text).toBe("checking results");
    if (secondRun?.kind === "toolRun") {
      expect(secondRun.blocks[0]?.kind === "toolCall" && secondRun.blocks[0].toolCall.id).toBe("bash-call");
    }
  });

  it("skips empty thinking blocks", () => {
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "   " },
        { type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } },
      ],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1)]);

    const sections = buildTurnSections(row.turn.items, "a1", null);

    expect(sections).toHaveLength(1);
    const run = sections[0];
    if (run?.kind === "toolRun") {
      expect(run.blocks.map((block) => block.kind)).toEqual(["toolCall"]);
    }
  });

  it("excludes the summary text and keeps intermediate text of the summary item", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(
        assistantMessage("a1", {
          content: [
            { type: "text", text: "almost done" },
            { type: "toolCall", id: "read-call", name: "read", arguments: {} },
            { type: "text", text: "the answer" },
          ],
        }),
      ),
    ]);

    const sections = buildTurnSections(row.turn.items, "a1", "the answer");

    expect(sections.map((section) => (section.kind === "text" ? `text:${section.text}` : "run"))).toEqual([
      "text:almost done",
      "run",
    ]);
  });

  it("produces no sections for a pure summary turn", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { content: [{ type: "text", text: "just the answer" }] })),
    ]);

    expect(buildTurnSections(row.turn.items, "a1", "just the answer")).toEqual([]);
  });

  it("excludes the summary message's thinking from tool runs", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(
        assistantMessage("a1", {
          content: [{ type: "toolCall", id: "read-call", name: "read", arguments: {} }],
        }),
      ),
      item(
        assistantMessage("a2", {
          content: [
            { type: "thinking", thinking: "let me compose" },
            { type: "text", text: "the answer" },
          ],
        }),
      ),
    ]);

    const sections = buildTurnSections(row.turn.items, "a2", "the answer");

    expect(sections).toHaveLength(1);
    const run = sections[0];
    if (run?.kind === "toolRun") {
      expect(run.blocks.map((block) => block.kind)).toEqual(["toolCall"]);
    }
  });

  it("splits a thought that appears after the message's last tool call out of the run", () => {
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "check first" },
        { type: "toolCall", id: "read-call", name: "read", arguments: {} },
        { type: "toolCall", id: "bash-call", name: "bash", arguments: {} },
        { type: "thinking", thinking: "command is done, now think about next" },
      ],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [{ type: "text", text: "the answer" }],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2)]);

    const sections = buildTurnSections(row.turn.items, "a2", "the answer");

    expect(sections.map((section) => (section.kind === "toolRun" ? "run" : section.kind))).toEqual(["run", "run"]);
    const firstRun = sections[0];
    const thoughtRun = sections[1];
    if (firstRun?.kind === "toolRun") {
      expect(firstRun.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "thinking",
        "read-call",
        "bash-call",
      ]);
    }
    if (thoughtRun?.kind === "toolRun") {
      expect(thoughtRun.blocks.map((block) => (block.kind === "thinking" ? block.thinking : ""))).toEqual([
        "command is done, now think about next",
      ]);
    }
  });

  it("keeps a thought trailing a tool call before the text that follows it", () => {
    // [toolCall, thinking, text] — the trailing thought chronologically precedes
    // the text, so it must render before it (never displaced below it).
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "toolCall", id: "read-call", name: "read", arguments: {} },
        { type: "thinking", thinking: "command is done, now think about next" },
        { type: "text", text: "mid narration" },
      ],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [{ type: "text", text: "the answer" }],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2)]);

    const sections = buildTurnSections(row.turn.items, "a2", "the answer");

    expect(sections.map((section) => (section.kind === "toolRun" ? "run" : section.kind))).toEqual([
      "run",
      "run",
      "text",
    ]);
    const firstRun = sections[0];
    const thoughtRun = sections[1];
    if (firstRun?.kind === "toolRun") {
      expect(firstRun.blocks.map((block) => (block.kind === "toolCall" ? block.toolCall.id : ""))).toEqual([
        "read-call",
      ]);
    }
    if (thoughtRun?.kind === "toolRun") {
      expect(thoughtRun.blocks.map((block) => (block.kind === "thinking" ? block.thinking : ""))).toEqual([
        "command is done, now think about next",
      ]);
    }
  });

  it("lets a following tool call join a trailing thought as its preamble", () => {
    // [toolCall, thinking] then a tool-only message: the trailing thought is not
    // part of the first run, but the next message's call joins it — the same
    // grouping as a leading thought in the next message.
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "toolCall", id: "read-call", name: "read", arguments: {} },
        { type: "thinking", thinking: "command is done, now think about next" },
      ],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [{ type: "toolCall", id: "bash-call", name: "bash", arguments: {} }],
    };
    const a3: AgentMessage = {
      id: "a3",
      role: "assistant",
      content: [{ type: "text", text: "the answer" }],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2), item(a3)]);

    const sections = buildTurnSections(row.turn.items, "a3", "the answer");

    expect(sections.map((section) => (section.kind === "toolRun" ? "run" : section.kind))).toEqual(["run", "run"]);
    const firstRun = sections[0];
    const secondRun = sections[1];
    if (firstRun?.kind === "toolRun") {
      expect(firstRun.blocks.map((block) => (block.kind === "toolCall" ? block.toolCall.id : ""))).toEqual([
        "read-call",
      ]);
    }
    if (secondRun?.kind === "toolRun") {
      expect(secondRun.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "thinking",
        "bash-call",
      ]);
    }
  });

  it("keeps a mixed summary message's thinking in the stack with its call", () => {
    // [thinking, toolCall, text] as the last message: the thought belongs with
    // the card inside the stack; only the trailing text is the summary.
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "compose the answer" },
        { type: "toolCall", id: "read-call", name: "read", arguments: {} },
        { type: "text", text: "the answer" },
      ],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1)]);

    const sections = buildTurnSections(row.turn.items, "a1", "the answer");
    const summaryThinking = extractTurnSummaryThinking(row.turn.items, "a1");

    expect(sections).toHaveLength(1);
    const run = sections[0];
    if (run?.kind === "toolRun") {
      expect(run.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "thinking",
        "read-call",
      ]);
    }
    expect(summaryThinking).toEqual([]);
  });

  it("keeps a text-carrying message's thinking inside its own tool run", () => {
    // Mirrors a real session: [thinking, web_fetch] then
    // [thinking, text, web_fetch] — the second thought belongs to its own
    // message's tool run (with fetch-2), never to the previous run with fetch-1,
    // and the narration text between them renders as its own section.
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "fetch the page" },
        { type: "toolCall", id: "fetch-1", name: "web_fetch", arguments: {} },
      ],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "overview page, fetch the guide" },
        { type: "text", text: "The page at /getting-started/ is just an overview hub." },
        { type: "toolCall", id: "fetch-2", name: "web_fetch", arguments: {} },
      ],
    };
    const a3: AgentMessage = {
      id: "a3",
      role: "assistant",
      content: [{ type: "text", text: "summary" }],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2), item(a3)]);

    const sections = buildTurnSections(row.turn.items, "a3", "summary");

    expect(sections.map((section) => (section.kind === "toolRun" ? "run" : section.kind))).toEqual([
      "run",
      "text",
      "run",
    ]);
    const firstRun = sections[0];
    const lastRun = sections[2];
    if (firstRun?.kind === "toolRun") {
      expect(firstRun.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "thinking",
        "fetch-1",
      ]);
    }
    if (lastRun?.kind === "toolRun") {
      expect(lastRun.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "thinking",
        "fetch-2",
      ]);
    }
  });

  it("groups tool calls of consecutive tool-only messages into one run", () => {
    // Mirrors a real session: several assistant messages that carry only
    // thinking + tool calls (no text) must end up as a single tool stack.
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "inspect the repo" },
        { type: "toolCall", id: "bash-1", name: "bash", arguments: {} },
        { type: "toolCall", id: "mem-1", name: "memory_search", arguments: {} },
      ],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "dig into the project files" },
        { type: "toolCall", id: "read-1", name: "read", arguments: {} },
        { type: "toolCall", id: "bash-2", name: "bash", arguments: {} },
      ],
    };
    const a3: AgentMessage = {
      id: "a3",
      role: "assistant",
      content: [
        { type: "toolCall", id: "read-2", name: "read", arguments: {} },
        { type: "toolCall", id: "read-3", name: "read", arguments: {} },
      ],
    };
    const a4: AgentMessage = {
      id: "a4",
      role: "assistant",
      content: [{ type: "text", text: "summary" }],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2), item(a3), item(a4)]);

    const sections = buildTurnSections(row.turn.items, "a4", "summary");

    expect(sections).toHaveLength(1);
    const run = sections[0];
    if (run?.kind === "toolRun") {
      expect(run.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "thinking",
        "bash-1",
        "mem-1",
        "thinking",
        "read-1",
        "bash-2",
        "read-2",
        "read-3",
      ]);
    }
  });

  it("splits the stack around a standalone thinking-only message", () => {
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [{ type: "toolCall", id: "read-1", name: "read", arguments: {} }],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [{ type: "thinking", thinking: "mid thought" }],
    };
    const a3: AgentMessage = {
      id: "a3",
      role: "assistant",
      content: [{ type: "toolCall", id: "bash-1", name: "bash", arguments: {} }],
    };
    const a4: AgentMessage = {
      id: "a4",
      role: "assistant",
      content: [{ type: "text", text: "summary" }],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2), item(a3), item(a4)]);

    const sections = buildTurnSections(row.turn.items, "a4", "summary");

    // The standalone thought splits the previous run; the following command
    // joins it as its preamble (same grouping as [thinking, toolCall] in one
    // message).
    expect(sections.map((section) => (section.kind === "toolRun" ? "run" : section.kind))).toEqual(["run", "run"]);
    const firstRun = sections[0];
    const thoughtRun = sections[1];
    if (firstRun?.kind === "toolRun") {
      expect(firstRun.blocks.map((block) => (block.kind === "toolCall" ? block.toolCall.id : ""))).toEqual(["read-1"]);
    }
    if (thoughtRun?.kind === "toolRun") {
      expect(thoughtRun.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "thinking",
        "bash-1",
      ]);
    }
  });

  it("keeps a working thought inside the run across the message's narration text", () => {
    // The narration pattern: [thinking, text, toolCall] — the thought leads into
    // the tool call, so it belongs in the stack with the card; the text renders
    // as its own section between the previous run and this message's run.
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [{ type: "toolCall", id: "read-1", name: "read", arguments: {} }],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me understand the task" },
        { type: "text", text: "I'll investigate this bug" },
        { type: "toolCall", id: "bash-1", name: "bash", arguments: {} },
      ],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2)]);

    const sections = buildTurnSections(row.turn.items, "a2", null);

    expect(sections.map((section) => (section.kind === "toolRun" ? "run" : section.kind))).toEqual([
      "run",
      "text",
      "run",
    ]);
    const firstRun = sections[0];
    const lastRun = sections[2];
    if (firstRun?.kind === "toolRun") {
      expect(firstRun.blocks.map((block) => (block.kind === "toolCall" ? block.toolCall.id : ""))).toEqual(["read-1"]);
    }
    if (lastRun?.kind === "toolRun") {
      expect(lastRun.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "thinking",
        "bash-1",
      ]);
    }
  });

  it("keeps the last message thinking inside the run while it still has tool calls", () => {
    // While the turn is working, the last message is still a working message
    // (thinking + tool call); its thought belongs in the tool stack, not the
    // summary area outside it.
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [{ type: "toolCall", id: "read-1", name: "read", arguments: {} }],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "checking the result" },
        { type: "toolCall", id: "bash-1", name: "bash", arguments: {} },
      ],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2)]);

    const sections = buildTurnSections(row.turn.items, "a2", null);

    expect(sections.map((section) => (section.kind === "toolRun" ? "run" : section.kind))).toEqual(["run"]);
    const run = sections[0];
    if (run?.kind === "toolRun") {
      expect(run.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "read-1",
        "thinking",
        "bash-1",
      ]);
    }
  });

  it("keeps a thought between tool calls inside the run", () => {
    const a1: AgentMessage = {
      id: "a1",
      role: "assistant",
      content: [
        { type: "toolCall", id: "read-call", name: "read", arguments: {} },
        { type: "thinking", thinking: "mid thought" },
        { type: "toolCall", id: "bash-call", name: "bash", arguments: {} },
      ],
    };
    const a2: AgentMessage = {
      id: "a2",
      role: "assistant",
      content: [{ type: "text", text: "the answer" }],
    };
    const row = firstTurn([item(userMessage("u1")), item(a1), item(a2)]);

    const sections = buildTurnSections(row.turn.items, "a2", "the answer");

    expect(sections).toHaveLength(1);
    const run = sections[0];
    if (run?.kind === "toolRun") {
      expect(run.blocks.map((block) => (block.kind === "thinking" ? "thinking" : block.toolCall.id))).toEqual([
        "read-call",
        "thinking",
        "bash-call",
      ]);
    }
  });
});

describe("getTurnLiveElapsedMs", () => {
  it("returns the elapsed time since the turn started while working", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      { message: assistantMessage("a1", { startedAtMs: 1_000_000 }), mergedToolResults: {}, isStreaming: true },
    ]);

    expect(getTurnLiveElapsedMs(row.turn, 1_012_000)).toBe(12_000);
  });

  it("falls back to the preceding user message timestamp when the turn lacks startedAtMs", () => {
    const row = firstTurn([
      item(userMessage("u1", undefined, 1_000_000)),
      { message: assistantMessage("a1"), mergedToolResults: {}, isStreaming: true },
    ]);

    expect(getTurnLiveElapsedMs(row.turn, 1_012_000)).toBe(12_000);
  });

  it("returns null for a finished turn", () => {
    const row = firstTurn([item(userMessage("u1")), item(assistantMessage("a1", { durationMs: 2500 }))]);

    expect(getTurnLiveElapsedMs(row.turn, 1_012_000)).toBeNull();
  });

  it("returns null when no start time is known at all", () => {
    const row = firstTurn([item(assistantMessage("a1"))]);
    row.turn.isWorking = true;

    expect(getTurnLiveElapsedMs(row.turn, 1_012_000)).toBeNull();
  });
});

describe("getTurnWorkedDurationMs", () => {
  it("returns the accumulated duration for a finished turn", () => {
    const row = firstTurn([item(userMessage("u1")), item(assistantMessage("a1", { durationMs: 2500 }))]);

    expect(getTurnWorkedDurationMs(row.turn)).toBe(2500);
  });

  it("returns null while the turn is still working (header shows working…)", () => {
    const row = firstTurn([item(userMessage("u1")), item(assistantMessage("a1", { startedAtMs: 1_000_000 }), true)]);

    expect(getTurnWorkedDurationMs(row.turn)).toBeNull();
  });

  it("derives the worked time from timestamps when durationMs is absent (history-loaded turns)", () => {
    const row = firstTurn([
      item(userMessage("u1", undefined, 1_000_000)),
      item(assistantMessage("a1", { timestamp: 1_042_000 })),
    ]);

    expect(getTurnWorkedDurationMs(row.turn)).toBe(42_000);
  });

  it("returns null for a finished turn with no duration data at all", () => {
    const row = firstTurn([item(assistantMessage("a1"))]);

    expect(getTurnWorkedDurationMs(row.turn)).toBeNull();
  });
});

describe("extractTurnSummaryThinking", () => {
  it("returns the thinking blocks of the last assistant message", () => {
    const thinking = extractTurnSummaryThinking(
      [
        item(assistantMessage("a1", { content: [{ type: "toolCall", id: "read-call", name: "read", arguments: {} }] })),
        item(
          assistantMessage("a2", {
            content: [
              { type: "thinking", thinking: "compose the answer" },
              { type: "text", text: "done" },
            ],
          }),
        ),
      ],
      "a2",
    );

    expect(thinking.map((block) => (block.kind === "thinking" ? block.thinking : "")).filter(Boolean)).toEqual([
      "compose the answer",
    ]);
  });

  it("returns empty when the summary message has no thinking or no summary message exists", () => {
    expect(extractTurnSummaryThinking([item(assistantMessage("a1"))], null)).toEqual([]);
    expect(
      extractTurnSummaryThinking([item(assistantMessage("a1", { content: [{ type: "text", text: "done" }] }))], "a1"),
    ).toEqual([]);
  });

  it("skips empty thinking blocks", () => {
    const thinking = extractTurnSummaryThinking(
      [
        item(
          assistantMessage("a1", {
            content: [
              { type: "thinking", thinking: "   " },
              { type: "text", text: "done" },
            ],
          }),
        ),
      ],
      "a1",
    );

    expect(thinking).toEqual([]);
  });

  it("returns empty when the summary message still has tool calls (a working message)", () => {
    const thinking = extractTurnSummaryThinking(
      [
        item(
          assistantMessage("a1", {
            content: [
              { type: "thinking", thinking: "working thought" },
              { type: "toolCall", id: "bash-1", name: "bash", arguments: {} },
            ],
          }),
        ),
      ],
      "a1",
    );

    expect(thinking).toEqual([]);
  });
});

describe("extractTurnSummaryText", () => {
  it("returns the text blocks that follow the final tool call of the last assistant message", () => {
    const summary = extractTurnSummaryText([
      item(userMessage("u1")),
      {
        message: {
          id: "a1",
          role: "assistant",
          content: [
            { type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } },
            { type: "text", text: "fixed it" },
          ],
        },
        mergedToolResults: {},
        isStreaming: false,
      },
    ]);

    expect(summary).toBe("fixed it");
  });

  it("returns all text when the last assistant message has no tool calls", () => {
    const summary = extractTurnSummaryText([
      item(userMessage("u1")),
      item(assistantMessage("a1")),
      item(assistantMessage("a2", { content: [{ type: "text", text: "summary answer" }] })),
    ]);

    expect(summary).toBe("summary answer");
  });

  it("returns null when the last assistant message has no trailing text", () => {
    const summary = extractTurnSummaryText([
      item(userMessage("u1")),
      {
        message: {
          id: "a1",
          role: "assistant",
          content: [{ type: "toolCall", id: "read-call", name: "read", arguments: { path: "src/a.ts" } }],
        },
        mergedToolResults: {},
        isStreaming: false,
      },
    ]);

    expect(summary).toBeNull();
  });

  it("ignores a trailing unmatched tool result when locating the last assistant message", () => {
    const summary = extractTurnSummaryText([
      item(userMessage("u1")),
      item(assistantMessage("a1", { content: [{ type: "text", text: "the answer" }] })),
      item(toolResultMessage("orphan-result", "missing-call")),
    ]);

    expect(summary).toBe("the answer");
  });
});

describe("formatTurnDuration", () => {
  it("formats sub-second durations in milliseconds", () => {
    expect(formatTurnDuration(950)).toBe("950ms");
  });

  it("formats seconds", () => {
    expect(formatTurnDuration(42_000)).toBe("42s");
  });

  it("formats minutes and seconds", () => {
    expect(formatTurnDuration(65_000)).toBe("1m 5s");
    expect(formatTurnDuration(120_000)).toBe("2m");
  });
});
