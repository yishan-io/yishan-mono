import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../store/agentChatTypes";
import {
  type TranscriptRow,
  type TurnItem,
  buildTranscriptRows,
  buildTurnSections,
  extractTurnSummaryText,
  extractTurnSummaryThinking,
  formatTurnDuration,
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

  it("records the duration of the last assistant message", () => {
    const rows = rowsOf([
      item(userMessage("u1")),
      item(assistantMessage("a1", { durationMs: 1500 })),
      item(assistantMessage("a2", { durationMs: 43000 })),
    ]);

    const turnRow = rows[1];
    expect(turnRow?.kind === "turn" ? turnRow.turn.workedDurationMs : null).toBe(43000);
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
});

describe("getTurnWorkedDurationMs", () => {
  it("returns the recorded duration for a finished turn", () => {
    const row = firstTurn([item(userMessage("u1")), item(assistantMessage("a1", { durationMs: 2500 }))]);

    expect(getTurnWorkedDurationMs(row.turn, 0)).toBe(2500);
  });

  it("computes live elapsed time for a working turn from startedAtMs", () => {
    const startedAtMs = 1_000_000;
    const row = firstTurn([item(userMessage("u1")), item(assistantMessage("a1", { startedAtMs }), true)]);

    expect(getTurnWorkedDurationMs(row.turn, 1_005_000)).toBe(5000);
  });

  it("returns null while working when no start time is known", () => {
    const row = firstTurn([item(userMessage("u1")), item(assistantMessage("a1"), true)]);

    expect(getTurnWorkedDurationMs(row.turn, 1_000_000)).toBeNull();
  });

  it("derives the worked time from timestamps when durationMs is absent (history-loaded turns)", () => {
    const row = firstTurn([
      item(userMessage("u1", undefined, 1_000_000)),
      item(assistantMessage("a1", { timestamp: 1_042_000 })),
    ]);

    expect(getTurnWorkedDurationMs(row.turn, 0)).toBe(42_000);
  });

  it("returns null for a finished turn with no duration data at all", () => {
    const row = firstTurn([item(assistantMessage("a1"))]);

    expect(getTurnWorkedDurationMs(row.turn, 0)).toBeNull();
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
