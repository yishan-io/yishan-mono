import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../chat/agentChatTypes";
import { normalizeIncomingAgentMessage } from "../../../subscriptions/agentChatInboundMessage";
import {
  type TurnItem,
  buildTranscriptRows,
  extractTurnSummaryText,
  getTurnLiveElapsedMs,
  getTurnWorkedDurationMs,
} from "./turnModel";

const completion: AgentMessage = {
  id: "notice",
  role: "custom",
  customType: "subagent-completion",
  display: true,
  content: "raw result must not become a summary",
  timestamp: 999_000,
  details: { version: 1, agentId: "run", agentName: "reviewer", status: "completed", sessionId: "child" },
};
const user: AgentMessage = { id: "user", role: "user", content: "prompt", timestamp: 1_000 };
const before: AgentMessage = {
  id: "before",
  role: "assistant",
  content: [{ type: "text", text: "Before" }],
  timestamp: 4_000,
};
const after: AgentMessage = { id: "after", role: "assistant", content: [{ type: "text", text: "After" }] };
const item = (message: AgentMessage): TurnItem => ({ message, isStreaming: false, mergedToolResults: {} });

describe("completion transcript boundaries", () => {
  it.each([false, true])("keeps user/assistant/completion/assistant chronological (history=%s)", (isHistory) => {
    const source = [user, before, completion, after];
    const messages = isHistory ? source.map((message) => normalizeIncomingAgentMessage(message) ?? message) : source;
    const rows = buildTranscriptRows(messages.map(item));
    expect(rows.map((row) => row.kind)).toEqual(["user", "turn", "completion", "turn"]);
    const firstTurn = rows[1];
    const nextTurn = rows[3];
    expect(firstTurn?.kind === "turn" && extractTurnSummaryText(firstTurn.turn.items)).toBe("Before");
    expect(nextTurn?.kind === "turn" && extractTurnSummaryText(nextTurn.turn.items)).toBe("After");
    expect(firstTurn?.kind === "turn" && getTurnWorkedDurationMs(firstTurn.turn)).toBeNull();
    // Only the latest display segment owns the logical parent timing.
    expect(nextTurn?.kind === "turn" && getTurnWorkedDurationMs(nextTurn.turn)).toBe(3_000);
  });

  it("keeps the preceding assistant working across a trailing child completion, without counting its timestamp", () => {
    const rows = buildTranscriptRows([user, before, completion].map(item), true);
    expect(rows.map((row) => row.kind)).toEqual(["user", "turn", "completion"]);
    expect(rows[1]?.kind === "turn" && rows[1].turn.isWorking).toBe(true);
    const finished = buildTranscriptRows([user, before, completion].map(item));
    expect(finished[1]?.kind === "turn" && getTurnWorkedDurationMs(finished[1].turn)).toBe(3_000);
  });

  it("does not revive an earlier turn across a new user prompt or invent an assistant turn", () => {
    const rows = buildTranscriptRows([before, user, completion].map(item), true);
    expect(rows.map((row) => row.kind)).toEqual(["turn", "user", "completion"]);
    expect(rows[0]?.kind === "turn" && rows[0].turn.isWorking).toBe(false);
    expect(buildTranscriptRows([completion].map(item), true).map((row) => row.kind)).toEqual(["completion"]);
  });

  it("unknown, hidden, and malformed custom messages do not split assistant/tool grouping", () => {
    for (const notice of [
      { ...completion, customType: "unknown" },
      { ...completion, display: false },
      { ...completion, details: {} },
    ]) {
      const rows = buildTranscriptRows([before, notice, after].map(item));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.kind === "turn" && rows[0].turn.items.map((entry) => entry.message.id)).toEqual([
        "before",
        "after",
      ]);
    }
  });
});

describe("completion-independent logical parent timing", () => {
  function required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error("expected a turn");
    return value;
  }

  function turns(messages: AgentMessage[], working = false) {
    return buildTranscriptRows(messages.map(item), working).flatMap((row) => (row.kind === "turn" ? [row.turn] : []));
  }

  it.each([false, true])("preserves gap-inclusive live/finished timing (history=%s)", (history) => {
    const head = history ? { ...before, timestamp: 5_000 } : { ...before, startedAtMs: 1_000, durationMs: 4_000 };
    const tail = history ? { ...after, timestamp: 12_000 } : { ...after, startedAtMs: 10_000, durationMs: 2_000 };
    // Child timing and cost must never enter the parent's timing projection.
    const notice = { ...completion, startedAtMs: -999_000, durationMs: 999_000 };
    const plain = turns([user, head, tail]);
    const split = turns([user, head, notice, tail]);
    expect(split.map((turn) => extractTurnSummaryText(turn.items))).toEqual(["Before", "After"]);
    expect(split.map(getTurnWorkedDurationMs)).toEqual([null, 11_000]);
    expect(split.map(getTurnWorkedDurationMs).reduce<number>((sum, ms) => sum + (ms ?? 0), 0)).toBe(
      getTurnWorkedDurationMs(required(plain[0])),
    );
    const livePlain = turns([user, head, tail], true);
    const liveSplit = turns([user, head, notice, tail], true);
    expect(liveSplit.map((turn) => turn.isWorking)).toEqual([false, true]);
    expect(getTurnLiveElapsedMs(required(liveSplit[1]), 12_000)).toBe(11_000);
    expect(getTurnLiveElapsedMs(required(liveSplit[1]), 12_000)).toBe(
      getTurnLiveElapsedMs(required(livePlain[0]), 12_000),
    );
    expect(getTurnWorkedDurationMs(required(liveSplit[1]))).toBeNull();
  });

  it("ignores trailing completions while working and finished, then resets on the next user", () => {
    const head = { ...before, startedAtMs: 1_000, durationMs: 4_000 };
    const tail = { ...after, startedAtMs: 10_000, durationMs: 2_000 };
    const messages = [user, head, completion, tail, { ...completion, id: "trailing" }];
    const live = turns(messages, true);
    expect(live.map((turn) => turn.isWorking)).toEqual([false, true]);
    expect(getTurnLiveElapsedMs(required(live[1]), 12_000)).toBe(11_000);
    expect(turns(messages).map(getTurnWorkedDurationMs)).toEqual([null, 11_000]);
    const nextUser = { ...user, id: "next-user", timestamp: 20_000 };
    expect(turns([...messages, nextUser], true).map((turn) => turn.isWorking)).toEqual([false, false]);
    const next = turns([
      ...messages,
      nextUser,
      { ...after, id: "next-assistant", startedAtMs: 21_000, durationMs: 2_000 },
    ]);
    expect(next.map(getTurnWorkedDurationMs)).toEqual([null, 11_000, 2_000]);
    expect(
      getTurnLiveElapsedMs(required(turns([...messages, nextUser, { ...after, timestamp: 22_000 }], true)[2]), 23_000),
    ).toBe(3_000);
  });
});
