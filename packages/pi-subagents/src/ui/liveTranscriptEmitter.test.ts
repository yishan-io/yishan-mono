import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../agents/types";
import {
  LIVE_TRANSCRIPTS_WIDGET_KEY,
  LIVE_TRANSCRIPT_THROTTLE_MS,
  createLiveTranscriptEmitter,
} from "./liveTranscriptEmitter";

function createRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "agent-1",
    agentName: "Explore",
    prompt: "Inspect auth",
    status: "running",
    mode: "foreground",
    createdAt: 1,
    sessionId: "child-session-1",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    },
    ...overrides,
  };
}

function createUiHarness() {
  const liveCalls: Array<string[] | undefined> = [];
  const ui = {
    setStatus: vi.fn(),
    setWidget: vi.fn((key: string, content: string[] | undefined) => {
      if (key === LIVE_TRANSCRIPTS_WIDGET_KEY) {
        liveCalls.push(content);
      }
    }),
    setWorkingMessage: vi.fn(),
    setWorkingVisible: vi.fn(),
    theme: { fg: () => "" },
  };
  return { ui, liveCalls };
}

function activeRecordWithMessages(messages: unknown[]): AgentRecord {
  return createRecord({ session: { messages } as never });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createLiveTranscriptEmitter", () => {
  it("throttles high-frequency pushes to at most one emission per window (latest wins)", async () => {
    vi.useFakeTimers();
    const { ui, liveCalls } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    // 10 pushes in one window; only the latest must be emitted at flush.
    for (let i = 0; i < 10; i++) {
      emitter.push([activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: `m${i}` }] }])]);
    }
    expect(liveCalls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS + 1);
    expect(liveCalls).toHaveLength(1);

    const payload = JSON.parse(liveCalls[0]?.[0] ?? "null") as {
      agents: { messages: { content: { text: string }[] }[] }[];
    };
    expect(payload.agents[0]?.messages[0]?.content[0]?.text).toBe("m9");
    expect(emitter.stats.coalesced).toBe(9);
    expect(emitter.stats.emissions).toBe(1);

    emitter.dispose();
  });

  it("emits at most once per throttle window over time", async () => {
    vi.useFakeTimers();
    const { ui, liveCalls } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    // 4 pushes across 4 windows => 4 emissions.
    for (let i = 0; i < 4; i++) {
      emitter.push([activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: `m${i}` }] }])]);
      await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS + 1);
    }
    expect(liveCalls).toHaveLength(4);
    expect(emitter.stats.emissions).toBe(4);

    emitter.dispose();
  });

  it("skips identical snapshots (dedupe)", async () => {
    vi.useFakeTimers();
    const { ui, liveCalls } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);
    const records = [activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: "same" }] }])];

    emitter.push(records);
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS + 1);
    expect(liveCalls).toHaveLength(1);

    // Same snapshot again (e.g. a session tick that changed nothing visible).
    emitter.push(records);
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS + 1);
    expect(liveCalls).toHaveLength(1);
    expect(emitter.stats.skippedIdentical).toBe(1);

    emitter.dispose();
  });

  it("cancels a pending payload flush when the last child completes first", async () => {
    vi.useFakeTimers();
    const { ui, liveCalls } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    emitter.push([activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: "m0" }] }])]);
    // A flush is pending; complete the child before it fires.
    emitter.push([createRecord({ status: "completed" })]);

    // No payload was ever emitted, so the clear is a no-op: zero calls.
    expect(liveCalls).toHaveLength(0);

    // The pending payload flush must not fire later.
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS * 2);
    expect(liveCalls).toHaveLength(0);
    expect(emitter.stats.emissions).toBe(0);

    emitter.dispose();
  });

  it("clears the widget immediately once a payload was emitted", async () => {
    vi.useFakeTimers();
    const { ui, liveCalls } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    emitter.push([activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: "m0" }] }])]);
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS + 1);
    expect(liveCalls).toHaveLength(1);

    emitter.push([createRecord({ status: "completed" })]);
    expect(liveCalls).toEqual([expect.any(Array), undefined]);
    expect(emitter.stats.clears).toBe(1);

    emitter.dispose();
  });

  it("does not re-emit a clear when the widget is already cleared", async () => {
    vi.useFakeTimers();
    const { ui, liveCalls } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    emitter.push([createRecord({ status: "completed" })]);
    emitter.push([createRecord({ status: "failed" })]);
    expect(liveCalls).toHaveLength(0);
    expect(emitter.stats.skippedIdentical).toBeGreaterThan(0);

    emitter.dispose();
  });

  it("flushNow emits the pending snapshot synchronously", async () => {
    vi.useFakeTimers();
    const { ui, liveCalls } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    emitter.push([activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: "m0" }] }])]);
    emitter.flushNow();
    expect(liveCalls).toHaveLength(1);

    // Nothing scheduled remains.
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS * 2);
    expect(liveCalls).toHaveLength(1);

    emitter.dispose();
  });

  it("dispose cancels scheduled work and blocks all further emission", async () => {
    vi.useFakeTimers();
    const { ui, liveCalls } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    emitter.push([activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: "m0" }] }])]);
    emitter.dispose();

    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS * 2);
    expect(liveCalls).toHaveLength(0);

    emitter.push([activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: "m1" }] }])]);
    emitter.flushNow();
    expect(liveCalls).toHaveLength(0);
  });

  it("accumulates payload byte stats", async () => {
    vi.useFakeTimers();
    const { ui } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    emitter.push([
      activeRecordWithMessages([{ role: "assistant", content: [{ type: "text", text: "A".repeat(2048) }] }]),
    ]);
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS + 1);

    expect(emitter.stats.emissions).toBe(1);
    expect(emitter.stats.serializedBytes).toBeGreaterThan(2048);
    expect(emitter.stats.peakPayloadBytes).toBe(emitter.stats.serializedBytes);

    emitter.dispose();
  });

  it("reports budget drops through its stats", async () => {
    vi.useFakeTimers();
    const { ui } = createUiHarness();
    const emitter = createLiveTranscriptEmitter(ui as never);

    // 16 children x 5 maxed messages force per-child and aggregate trims.
    const records = Array.from({ length: 16 }, (_, i) =>
      createRecord({
        id: `agent-${i + 1}`,
        sessionId: `child-${i + 1}`,
        session: {
          messages: Array.from({ length: 5 }, () => ({
            role: "assistant",
            content: [{ type: "text", text: "A".repeat(64 * 1024) }],
          })),
        } as never,
      }),
    );
    emitter.push(records);
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS + 1);

    expect(emitter.stats.droppedChildren).toBeGreaterThan(0);
    expect(emitter.stats.droppedMessages).toBeGreaterThan(0);

    emitter.dispose();
  });
});
