import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../../../domains/agent/agentChatTypes";
import {
  type TranscriptRow,
  type TurnItem,
  buildTranscriptRows,
  getTurnElapsedSpanMs,
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

function item(message: AgentMessage, isStreaming = false): TurnItem {
  return { message, mergedToolResults: {}, isStreaming };
}

function firstTurn(displayMessages: TurnItem[]): Extract<TranscriptRow, { kind: "turn" }> {
  const row = buildTranscriptRows(displayMessages).find((candidate) => candidate.kind === "turn");
  if (!row || row.kind !== "turn") {
    throw new Error("expected a turn row");
  }
  return row;
}

describe("getTurnElapsedSpanMs", () => {
  it("spans from the first assistant start to the final assistant end", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 4_000 })),
    ]);

    expect(getTurnElapsedSpanMs(row.turn)).toBe(4_000);
  });

  it("includes the gap between multi-round core turns exactly once", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      // Core turn 1: 1_000_000 → 1_005_000.
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 5_000 })),
      // 2s gap between core turns.
      // Core turn 2: 1_007_000 → 1_012_000.
      item(assistantMessage("a2", { startedAtMs: 1_007_000, durationMs: 5_000 })),
      // 1s gap between core turns.
      // Core turn 3: 1_013_000 → 1_020_000.
      item(assistantMessage("a3", { startedAtMs: 1_013_000, durationMs: 7_000 })),
    ]);

    expect(getTurnElapsedSpanMs(row.turn)).toBe(20_000);
  });

  it("returns null when the final assistant lacks renderer timing", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 4_000 })),
      // Reloaded tail: timestamp only, no renderer-observed start/end.
      item(assistantMessage("a2", { timestamp: 1_010_000 })),
    ]);

    expect(getTurnElapsedSpanMs(row.turn)).toBeNull();
  });

  it("returns null when no assistant has a renderer start (history-loaded turn)", () => {
    const row = firstTurn([item(userMessage("u1")), item(assistantMessage("a1", { timestamp: 1_042_000 }))]);

    expect(getTurnElapsedSpanMs(row.turn)).toBeNull();
  });
});

describe("getTurnWorkedDurationMs — finished elapsed span", () => {
  it("uses the elapsed span for a no-tool turn", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 4_000 })),
    ]);

    expect(getTurnWorkedDurationMs(row.turn)).toBe(4_000);
  });

  it("counts sequential foreground Agent wait serially within one core turn", () => {
    // The assistant streams from 1_000_000 to 1_002_000, then Agent A runs 4s
    // and Agent B runs 4s serially; turn_end at 1_010_000 extends the message
    // through the whole serial wait, not just the streaming interval.
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 10_000 })),
    ]);

    expect(getTurnWorkedDurationMs(row.turn)).toBe(10_000);
  });

  it("counts overlapping Agents once by enclosing wall time, not by summed child durations", () => {
    // Both Agents overlap inside one 5s window; the enclosing wall time is 5s,
    // never 5s + 5s = 10s of summed child durations.
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 5_000 })),
    ]);

    expect(getTurnWorkedDurationMs(row.turn)).toBe(5_000);
  });

  it("includes the gap between multi-round core turns once, not as summed durations", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 5_000 })),
      item(assistantMessage("a2", { startedAtMs: 1_007_000, durationMs: 5_000 })),
      item(assistantMessage("a3", { startedAtMs: 1_013_000, durationMs: 7_000 })),
    ]);

    // Span = final end (1_020_000) − first start (1_000_000); the accumulated
    // assistant durations would under-count at 17_000.
    expect(getTurnWorkedDurationMs(row.turn)).toBe(20_000);
    expect(getTurnWorkedDurationMs(row.turn)).not.toBe(17_000);
  });

  it("never drops below the live elapsed boundary at the moment the turn finished", () => {
    const workingRow = firstTurn([
      item(userMessage("u1")),
      { message: assistantMessage("a1", { startedAtMs: 1_000_000 }), mergedToolResults: {}, isStreaming: true },
      { message: assistantMessage("a2", { startedAtMs: 1_007_000 }), mergedToolResults: {}, isStreaming: true },
    ]);
    const liveAtFinish = getTurnLiveElapsedMs(workingRow.turn, 1_020_000);
    expect(liveAtFinish).toBe(20_000);

    // The same turn finished: the final assistant's durationMs was extended
    // through turn_end to 1_020_000.
    const finishedRow = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 5_000 })),
      item(assistantMessage("a2", { startedAtMs: 1_007_000, durationMs: 13_000 })),
    ]);

    expect(getTurnWorkedDurationMs(finishedRow.turn)).toBe(liveAtFinish);
  });
});

describe("getTurnWorkedDurationMs — documented fallbacks", () => {
  it("derives completed history from user-to-last-assistant timestamps", () => {
    const row = firstTurn([
      item(userMessage("u1", undefined, 1_000_000)),
      item(assistantMessage("a1", { timestamp: 1_042_000 })),
    ]);

    expect(getTurnWorkedDurationMs(row.turn)).toBe(42_000);
  });

  it("keeps accumulated durations when the final assistant is an untimed reloaded tail", () => {
    const row = firstTurn([
      item(userMessage("u1")),
      item(assistantMessage("a1", { startedAtMs: 1_000_000, durationMs: 4_000 })),
      // Reloaded tail carries only a timestamp: the span is unavailable, so the
      // renderer-timed part keeps its accumulated duration.
      item(assistantMessage("a2", { timestamp: 1_010_000 })),
    ]);

    expect(getTurnWorkedDurationMs(row.turn)).toBe(4_000);
  });

  it("starts the span at the first renderer-timed assistant after a history head", () => {
    const row = firstTurn([
      item(userMessage("u1", undefined, 1_000_000)),
      // History head: timestamps only, no renderer timing.
      item(assistantMessage("h1", { timestamp: 1_042_000 })),
      // Resumed live part, observed from 1_050_000 through 1_056_000.
      item(assistantMessage("l1", { startedAtMs: 1_050_000, durationMs: 6_000 })),
    ]);

    // No invented precision for the history head: the finished span starts at
    // the first renderer-timed assistant, exactly like the live header.
    expect(getTurnWorkedDurationMs(row.turn)).toBe(6_000);
  });
});
