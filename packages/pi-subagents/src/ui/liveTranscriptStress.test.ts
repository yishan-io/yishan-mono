import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../agents/types";
import { bindAgentProgressUi } from "./agentProgress";
import { MAX_LIVE_AGGREGATE_UTF8_BYTES, MAX_LIVE_PAYLOAD_OVERHEAD_BYTES } from "./liveTranscriptBudget";
import { LIVE_TRANSCRIPTS_WIDGET_KEY, LIVE_TRANSCRIPT_THROTTLE_MS } from "./liveTranscriptEmitter";

/**
 * Stress fixture for the 2026-08-16 OOM incident (8 parallel sub-agents).
 *
 * Phase 0 (baseline): reproduces the pre-fix full-snapshot emission rate —
 * one widget emission per session notification, each serializing the full
 * aggregate transcript (event count × aggregate size amplification).
 *
 * Phase 1 (regression): the same workload must stay bounded — time-throttled
 * latest-value-wins emission, byte budgets before serialization, active
 * children only, and a cleared widget once every child completes.
 */

const CHILD_COUNT = 8;
const ROUNDS = 20;
/** Bytes per message text; two messages (assistant + tool result) per child per round. */
const TEXT_BYTES = 8192;
/** Producer pace: one child session notification every millisecond. */
const PRODUCER_INTERVAL_MS = 1;

function createMeasuringUi() {
  const payloadEmissions: string[] = [];
  let clears = 0;

  const ui = {
    setStatus: vi.fn(),
    setWidget: vi.fn((key: string, content: string[] | undefined) => {
      if (key !== LIVE_TRANSCRIPTS_WIDGET_KEY) {
        return;
      }
      if (content === undefined) {
        clears += 1;
        return;
      }
      payloadEmissions.push(content[0] ?? "");
    }),
    setWorkingMessage: vi.fn(),
    setWorkingVisible: vi.fn(),
    theme: { fg: () => "" },
  };

  const payloadBytes = (widget: string): number => new TextEncoder().encode(widget).length;
  const totalBytes = (): number => payloadEmissions.reduce((sum, widget) => sum + payloadBytes(widget), 0);
  const peakBytes = (): number => payloadEmissions.reduce((max, widget) => Math.max(max, payloadBytes(widget)), 0);

  return {
    ui,
    stats: () => ({
      emissions: payloadEmissions.length,
      clears,
      totalBytes: totalBytes(),
      peakBytes: peakBytes(),
      payloads: payloadEmissions,
    }),
  };
}

function makeAssistantMessage(text: string): Record<string, unknown> {
  return { role: "assistant", content: [{ type: "text", text }] };
}

function makeToolResultMessage(text: string): Record<string, unknown> {
  return {
    role: "toolResult",
    toolCallId: `call-${text.length}`,
    toolName: "bash",
    content: [{ type: "text", text }],
    details: { path: "x".repeat(2048) },
    isError: false,
  };
}

function makeSessionMessages(round: number): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  for (let r = 1; r <= round; r++) {
    messages.push(makeAssistantMessage("A".repeat(TEXT_BYTES)));
    messages.push(makeToolResultMessage("B".repeat(TEXT_BYTES)));
  }
  return messages;
}

function makeRecords(round: number): AgentRecord[] {
  const messages = makeSessionMessages(round);
  return Array.from({ length: CHILD_COUNT }, (_, i) =>
    createRecord({
      id: `agent-${i + 1}`,
      agentName: `Explorer-${i + 1}`,
      sessionId: `child-${i + 1}`,
      session: { messages, thinkingLevel: "low" } as never,
    }),
  );
}

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

function driveEightChildWorkload(): Promise<{
  stats: ReturnType<ReturnType<typeof createMeasuringUi>["stats"]>;
  heapUsedDeltaBytes: number;
  rssDeltaBytes: number;
}> {
  return (async () => {
    vi.useFakeTimers();
    const { ui, stats } = createMeasuringUi();
    let listener: ((records: AgentRecord[]) => void) | undefined;
    const subscribe = vi.fn((fn: (records: AgentRecord[]) => void) => {
      listener = fn;
      fn([]);
      return () => {};
    });

    const heapBefore = process.memoryUsage();
    const dispose = bindAgentProgressUi({ subscribe } as never, ui as never, "rpc");
    expect(listener).toBeDefined();

    // 8 children, each emitting one session notification per round with a
    // growing transcript. Producer pace (1 ms) is far faster than the consumer
    // can drain a widget update.
    for (let round = 1; round <= ROUNDS; round++) {
      for (let child = 0; child < CHILD_COUNT; child++) {
        listener?.(makeRecords(round));
        await vi.advanceTimersByTimeAsync(PRODUCER_INTERVAL_MS);
      }
    }

    // All children complete: the widget must be cleared.
    listener?.(makeRecords(ROUNDS).map((record) => ({ ...record, status: "completed" as const })));
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS * 2 + 50);

    const heapAfter = process.memoryUsage();
    dispose();

    return {
      stats: stats(),
      heapUsedDeltaBytes: heapAfter.heapUsed - heapBefore.heapUsed,
      rssDeltaBytes: heapAfter.rss - heapBefore.rss,
    };
  })();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("live-transcript emission under 8-parallel load", () => {
  it("bounds emissions, payload bytes, and heap growth for a fast producer and slow consumer", async () => {
    const { stats, heapUsedDeltaBytes, rssDeltaBytes } = await driveEightChildWorkload();

    // Record measurements for the incident log (Phase 0 baseline vs fix).
    console.log(
      `[pi-subagents stress] emissions=${stats.emissions} clears=${stats.clears} totalBytes=${(stats.totalBytes / 1024 / 1024).toFixed(2)}MiB peakBytes=${(stats.peakBytes / 1024 / 1024).toFixed(2)}MiB heapUsedDelta=${(heapUsedDeltaBytes / 1024 / 1024).toFixed(2)}MiB rssDelta=${(rssDeltaBytes / 1024 / 1024).toFixed(2)}MiB`,
    );

    // 160 notifications over 160 ms must collapse to ~1-2 emissions (throttle),
    // never one emission per notification.
    const notificationCount = ROUNDS * CHILD_COUNT;
    const maxBoundedEmissions = Math.ceil((notificationCount * PRODUCER_INTERVAL_MS) / LIVE_TRANSCRIPT_THROTTLE_MS) + 1;
    expect(stats.emissions).toBeGreaterThanOrEqual(1);
    expect(stats.emissions).toBeLessThanOrEqual(maxBoundedEmissions);
    expect(stats.emissions).toBeLessThan(notificationCount);

    // Every emitted widget stays below the aggregate ceiling plus JSON overhead.
    const widgetCeiling = MAX_LIVE_AGGREGATE_UTF8_BYTES + MAX_LIVE_PAYLOAD_OVERHEAD_BYTES;
    expect(stats.peakBytes).toBeLessThanOrEqual(widgetCeiling);
    expect(stats.totalBytes).toBeLessThanOrEqual(stats.emissions * widgetCeiling);

    // Serialized bytes must scale linearly with emissions, not quadratically
    // with the aggregate transcript size.
    expect(stats.totalBytes).toBeLessThanOrEqual(notificationCount * widgetCeiling);

    // Every payload contains only active children and the v1 protocol shape.
    for (const payload of stats.payloads) {
      const parsed = JSON.parse(payload) as { version: number; agents: { status: string }[] };
      expect(parsed.version).toBe(1);
      expect(parsed.agents.length).toBeGreaterThan(0);
      for (const agent of parsed.agents) {
        expect(["queued", "starting", "running"]).toContain(agent.status);
      }
    }

    // Completed children are removed from the payload and the widget clears.
    expect(stats.clears).toBeGreaterThanOrEqual(1);
  });

  it("emits at most one snapshot when the entire burst lands in one throttle window", async () => {
    vi.useFakeTimers();
    const { ui, stats } = createMeasuringUi();
    let listener: ((records: AgentRecord[]) => void) | undefined;
    const subscribe = vi.fn((fn: (records: AgentRecord[]) => void) => {
      listener = fn;
      fn([]);
      return () => {};
    });

    const dispose = bindAgentProgressUi({ subscribe } as never, ui as never, "rpc");

    for (let round = 1; round <= ROUNDS; round++) {
      for (let child = 0; child < CHILD_COUNT; child++) {
        listener?.(makeRecords(round));
      }
    }
    await vi.advanceTimersByTimeAsync(LIVE_TRANSCRIPT_THROTTLE_MS + 1);

    expect(stats().emissions).toBeLessThanOrEqual(2);
    expect(stats().payloads).toHaveLength(1);

    dispose();
  });
});
