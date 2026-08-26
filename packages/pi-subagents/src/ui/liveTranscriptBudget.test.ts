import { describe, expect, it } from "vitest";

import type { AgentRecord } from "../agents/types";
import {
  MAX_LIVE_AGGREGATE_UTF8_BYTES,
  MAX_LIVE_DETAILS_STRING_UTF8_BYTES,
  MAX_LIVE_DETAILS_UTF8_BYTES,
  MAX_LIVE_MESSAGES_PER_CHILD,
  MAX_LIVE_PAYLOAD_OVERHEAD_BYTES,
  MAX_LIVE_PER_CHILD_UTF8_BYTES,
  MAX_LIVE_PER_MESSAGE_UTF8_BYTES,
  TRUNCATION_NOTICE,
  countUtf8Bytes,
  normalizeBoundedRecord,
  truncateUtf8Bytes,
} from "./liveTranscriptBudget";
import { countLiveMessageUtf8Bytes } from "./liveTranscriptMessage";
import { buildLiveTranscriptPayload } from "./liveTranscriptPayload";

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

function runningRecord(messages: unknown[]): AgentRecord {
  return createRecord({
    session: { messages, thinkingLevel: "low" } as never,
  });
}

function textMessage(role: "assistant" | "user" | "toolResult", text: string): Record<string, unknown> {
  if (role === "toolResult") {
    return {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text }],
      isError: false,
    };
  }
  return { role, content: [{ type: "text", text }] };
}

describe("countUtf8Bytes", () => {
  it("counts ASCII bytes as 1 per char", () => {
    expect(countUtf8Bytes("abc")).toBe(3);
  });

  it("counts multibyte UTF-8 sequences", () => {
    expect(countUtf8Bytes("你好")).toBe(6);
    expect(countUtf8Bytes("A😀")).toBe(5); // 1 + 4
  });
});

describe("truncateUtf8Bytes", () => {
  it("returns text unchanged when within the limit", () => {
    expect(truncateUtf8Bytes("short", 100)).toBe("short");
  });

  it("appends the truncation notice and stays within the limit", () => {
    const truncated = truncateUtf8Bytes("A".repeat(100), 32);
    expect(countUtf8Bytes(truncated)).toBeLessThanOrEqual(32);
    expect(truncated.endsWith(TRUNCATION_NOTICE)).toBe(true);
  });

  it("never splits a multi-byte character", () => {
    const text = "你".repeat(50); // 150 bytes
    const truncated = truncateUtf8Bytes(text, 20);
    expect(countUtf8Bytes(truncated)).toBeLessThanOrEqual(20);
    // Decoded content must be a whole number of multi-byte chars plus notice.
    const content = truncated.slice(0, -TRUNCATION_NOTICE.length);
    expect(content.length % 1).toBe(0);
    expect([...content].every((char) => char === "你")).toBe(true);
  });

  it("returns an empty string when the limit is smaller than the notice", () => {
    expect(truncateUtf8Bytes("A".repeat(10), 1)).toBe("");
  });
});

describe("normalizeBoundedRecord", () => {
  it("bounds strings to the per-string budget", () => {
    const result = normalizeBoundedRecord({ path: "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES + 100) }, 0);
    expect(result).toBeDefined();
    expect(countUtf8Bytes(result?.path as string)).toBeLessThanOrEqual(MAX_LIVE_DETAILS_STRING_UTF8_BYTES);
  });

  it("bounds nested depth and item counts", () => {
    const deep: Record<string, unknown> = {
      path: { path: { path: { path: { path: { path: { path: { path: "deep" } } } } } } },
    };
    const result = normalizeBoundedRecord(deep, 0);
    expect(result).toBeDefined();
    // Records nested deeper than MAX_LIVE_DETAILS_DEPTH are dropped.
    expect(JSON.stringify(result)).not.toContain("deep");

    const wide = normalizeBoundedRecord({ entries: Array.from({ length: 500 }, (_, i) => `v${i}`) }, 0);
    expect((wide?.entries as string[]).length).toBeLessThanOrEqual(100);
  });
});

describe("buildLiveTranscriptPayload", () => {
  it("returns no payload when no active children remain", () => {
    const { payload } = buildLiveTranscriptPayload([createRecord({ status: "completed" })]);
    expect(payload).toBeUndefined();
  });

  it("excludes completed children and keeps active ones", () => {
    const active = runningRecord([textMessage("assistant", "Working")]);
    const done = createRecord({
      id: "agent-2",
      status: "completed",
      sessionId: "child-2",
      session: { messages: [] } as never,
    });
    const { payload } = buildLiveTranscriptPayload([done, active]);

    expect(payload?.agents).toHaveLength(1);
    expect(payload?.agents[0]?.agentId).toBe("agent-1");
  });

  it("normalizes assistant messages to a bounded shape", () => {
    const raw = [
      {
        role: "assistant",
        content: [{ type: "text", text: "Working" }],
        api: { provider: "deepseek" },
        provider: "deepseek",
        model: "deepseek-chat",
        usage: { input: 1, output: 2 },
      },
    ];
    const { payload } = buildLiveTranscriptPayload([runningRecord(raw)]);

    // Redundant metadata is dropped, but numeric usage is preserved.
    expect(payload?.agents[0]?.messages).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Working" }], usage: { input: 1, output: 2 } },
    ]);
  });

  it("preserves fields the desktop transcript renderer reads", () => {
    const raw = [
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "pondering",
            thinkingSignature: { id: "sig-1", type: "commentary", summary: [{ type: "text", text: "summary line" }] },
          },
        ],
        stopReason: "stop",
        errorMessage: "boom",
        usage: { input: 10, output: 20, cost: { total: 0.5 } },
        timestamp: 123,
        startedAtMs: 100,
        durationMs: 23,
      },
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "ok" }],
        startedAtMs: 150,
        durationMs: 40,
        isError: false,
      },
    ];
    const { payload } = buildLiveTranscriptPayload([runningRecord(raw)]);

    const messages = payload?.agents[0]?.messages ?? [];
    expect(messages[0]).toMatchObject({
      role: "assistant",
      stopReason: "stop",
      errorMessage: "boom",
      usage: { input: 10, output: 20, cost: { total: 0.5 } },
      timestamp: 123,
      startedAtMs: 100,
      durationMs: 23,
    });
    const thinkingBlock = (messages[0]?.content as { type: string; thinkingSignature?: unknown }[]).find(
      (block) => block.type === "thinking",
    );
    expect(thinkingBlock?.thinkingSignature).toEqual({
      id: "sig-1",
      type: "commentary",
      summary: [{ type: "text", text: "summary line" }],
    });
    expect(messages[1]).toMatchObject({
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      isError: false,
      startedAtMs: 150,
      durationMs: 40,
    });
  });

  it("truncates a single oversized message to the per-message budget", () => {
    const hugeText = "x".repeat(MAX_LIVE_PER_MESSAGE_UTF8_BYTES * 8); // 512 KiB
    const { payload, stats } = buildLiveTranscriptPayload([runningRecord([textMessage("assistant", hugeText)])]);

    const text = payload?.agents[0]?.messages[0]?.content;
    expect(typeof text).toBe("object");
    const emittedText = Array.isArray(text) ? ((text[0] as { text: string }).text ?? "") : (text as string);
    expect(countUtf8Bytes(emittedText)).toBeLessThanOrEqual(MAX_LIVE_PER_MESSAGE_UTF8_BYTES);
    expect(stats.truncatedStrings).toBeGreaterThanOrEqual(1);
  });

  it("caps messages per child to the newest MAX_LIVE_MESSAGES_PER_CHILD", () => {
    const messages = Array.from({ length: MAX_LIVE_MESSAGES_PER_CHILD + 50 }, (_, i) =>
      textMessage("assistant", `m${i}`),
    );
    const { payload, stats } = buildLiveTranscriptPayload([runningRecord(messages)]);

    const kept = payload?.agents[0]?.messages ?? [];
    expect(kept).toHaveLength(MAX_LIVE_MESSAGES_PER_CHILD);
    // Newest 100 kept: the first kept message is m50 (index 50 of 150).
    expect((kept[0]?.content as { text: string }[])[0]?.text).toBe("m50");
    expect(stats.totalMessagesBefore).toBe(MAX_LIVE_MESSAGES_PER_CHILD + 50);
    expect(stats.totalMessagesAfter).toBe(MAX_LIVE_MESSAGES_PER_CHILD);
  });

  it("keeps a delayed tool result with its call across the count boundary", () => {
    const assistantCall = {
      role: "assistant",
      content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: {} }],
    };
    const unrelatedMessages = Array.from({ length: MAX_LIVE_MESSAGES_PER_CHILD - 1 }, (_, index) =>
      textMessage("assistant", `unrelated-${index}`),
    );
    const delayedResult = textMessage("toolResult", "done");
    const { payload } = buildLiveTranscriptPayload([
      runningRecord([assistantCall, ...unrelatedMessages, delayedResult]),
    ]);

    const messages = payload?.agents[0]?.messages ?? [];
    expect(messages).toHaveLength(MAX_LIVE_MESSAGES_PER_CHILD);
    expect(messages[0]).toMatchObject({ role: "assistant", content: [{ type: "toolCall", id: "call-1" }] });
    expect((messages[1]?.content as { text: string }[])[0]?.text).toBe("unrelated-1");
    expect((messages.at(-2)?.content as { text: string }[])[0]?.text).toBe(
      `unrelated-${MAX_LIVE_MESSAGES_PER_CHILD - 2}`,
    );
    expect(messages.at(-1)).toMatchObject({ role: "toolResult", toolCallId: "call-1" });
  });

  it("trims a child's oldest messages when the per-child byte budget is exceeded", () => {
    // 200 messages x ~1 KiB = 200 KiB fits; make each message 4 KiB -> 800 KiB.
    const messages = Array.from({ length: 200 }, () => textMessage("assistant", "A".repeat(4096)));
    const { payload, stats } = buildLiveTranscriptPayload([runningRecord(messages)]);

    const kept = payload?.agents[0]?.messages ?? [];
    expect(kept.length).toBeGreaterThan(0);
    const bytes = kept.reduce((sum, message) => sum + countLiveMessageUtf8Bytes(message), 0);
    expect(bytes).toBeLessThanOrEqual(MAX_LIVE_PER_CHILD_UTF8_BYTES);
    expect(stats.droppedMessages).toBeGreaterThan(0);
    // Newest message kept, oldest dropped.
    expect((kept[kept.length - 1]?.content as { text: string }[])[0]?.text).toBe("A".repeat(4096));
  });

  it("drops a tool result when byte trimming evicts its matching tool call", () => {
    const assistantCall = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-1",
          name: "bash",
          arguments: {
            command: "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES),
            cwd: "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES),
            env: "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES),
            shell: "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES),
          },
        },
      ],
    };
    const matchingResult = textMessage("toolResult", "R".repeat(MAX_LIVE_PER_MESSAGE_UTF8_BYTES));
    const newerUnrelatedMessages = Array.from({ length: 3 }, () => textMessage("assistant", "U".repeat(60 * 1024)));

    const { payload } = buildLiveTranscriptPayload([
      runningRecord([assistantCall, matchingResult, ...newerUnrelatedMessages]),
    ]);

    const messages = payload?.agents[0]?.messages ?? [];
    expect(messages).toHaveLength(3);
    expect(messages.every((message) => message.role === "assistant")).toBe(true);
    expect(messages.some((message) => message.role === "toolResult" && message.toolCallId === "call-1")).toBe(false);
  });

  it("drops all parallel results when their multi-call assistant is evicted", () => {
    const assistantCalls = {
      role: "assistant",
      content: [
        { type: "toolCall", id: "call-1", name: "bash", arguments: {} },
        { type: "toolCall", id: "call-2", name: "read", arguments: {} },
      ],
    };
    const resultForSecondCall = {
      role: "toolResult",
      toolCallId: "call-2",
      toolName: "read",
      content: [{ type: "text", text: "R".repeat(MAX_LIVE_PER_MESSAGE_UTF8_BYTES) }],
    };
    const resultForFirstCall = textMessage("toolResult", "R".repeat(MAX_LIVE_PER_MESSAGE_UTF8_BYTES));
    const newerUnrelatedMessages = Array.from({ length: 3 }, () => textMessage("assistant", "U".repeat(60 * 1024)));

    const { payload } = buildLiveTranscriptPayload([
      runningRecord([assistantCalls, resultForSecondCall, resultForFirstCall, ...newerUnrelatedMessages]),
    ]);

    const messages = payload?.agents[0]?.messages ?? [];
    expect(messages).toHaveLength(3);
    expect(messages.every((message) => message.role === "assistant")).toBe(true);
    expect(messages.some((message) => message.role === "toolResult")).toBe(false);
  });

  it("drops oldest children to fit the aggregate budget, keeping at least one", () => {
    // 16 children, each at ~320 KiB of messages (5 x 64 KiB, under the
    // per-message cap) => per-child trim keeps ~256 KiB, aggregate ~4 MiB.
    const records = Array.from({ length: 16 }, (_, i) =>
      createRecord({
        id: `agent-${i + 1}`,
        sessionId: `child-${i + 1}`,
        session: {
          messages: Array.from({ length: 5 }, () => textMessage("assistant", "A".repeat(64 * 1024))),
        } as never,
      }),
    );
    const { payload, stats } = buildLiveTranscriptPayload(records);

    expect(payload).toBeDefined();
    expect(payload?.agents.length).toBeGreaterThanOrEqual(1);
    // Newest child (agent-16) always kept.
    expect(payload?.agents.at(-1)?.agentId).toBe("agent-16");
    const aggregate = (payload?.agents ?? []).reduce(
      (sum, agent) => sum + agent.messages.reduce((s, m) => s + countLiveMessageUtf8Bytes(m), 0),
      0,
    );
    expect(aggregate).toBeLessThanOrEqual(MAX_LIVE_AGGREGATE_UTF8_BYTES);
    expect(stats.droppedChildren).toBeGreaterThan(0);
  });

  it("never lets one oversized message bypass the aggregate cap", () => {
    const huge = "x".repeat(MAX_LIVE_PER_MESSAGE_UTF8_BYTES * 160); // ~10 MiB
    const { payload } = buildLiveTranscriptPayload([
      createRecord({
        session: { messages: [textMessage("toolResult", huge)] } as never,
      }),
    ]);

    expect(payload).toBeDefined();
    const aggregate = (payload?.agents ?? []).reduce(
      (sum, agent) => sum + agent.messages.reduce((s, m) => s + countLiveMessageUtf8Bytes(m), 0),
      0,
    );
    expect(aggregate).toBeLessThanOrEqual(MAX_LIVE_AGGREGATE_UTF8_BYTES);
  });

  it("keeps the serialized widget below the ceiling for a single child with a multi-MiB details blob", () => {
    // A details tree is bounded per-string/per-item but NOT by total bytes in
    // normalizeBoundedRecord alone; the total-byte trim must keep the widget
    // under the ceiling even when only one child is active. Shape-bounded, this
    // blob is ~40 MiB (100 keys x 100 x 4 KiB); the total-byte trim must cap it.
    const details: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) {
      details[`k${i}`] = { nested: Array.from({ length: 100 }, () => "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES)) };
    }
    const { payload } = buildLiveTranscriptPayload([
      createRecord({
        session: {
          messages: [
            {
              role: "toolResult",
              toolCallId: "call-1",
              toolName: "bash",
              content: [{ type: "text", text: "ok" }],
              details,
            },
          ],
        } as never,
      }),
    ]);

    expect(payload).toBeDefined();
    const widgetBytes = countUtf8Bytes(JSON.stringify(payload));
    expect(widgetBytes).toBeLessThanOrEqual(MAX_LIVE_AGGREGATE_UTF8_BYTES + MAX_LIVE_PAYLOAD_OVERHEAD_BYTES);
    // The blob itself was total-bytes bounded, not passed through.
    const emittedDetails = payload?.agents[0]?.messages[0]?.details;
    if (emittedDetails) {
      expect(countUtf8Bytes(JSON.stringify(emittedDetails))).toBeLessThanOrEqual(MAX_LIVE_DETAILS_UTF8_BYTES + 64);
    }
  });

  it("bounds toolCall arguments to the total-bytes budget", () => {
    const assistant = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-1",
          name: "bash",
          arguments: {
            big: Array.from({ length: 100 }, () => "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES)),
            command: "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES + 100),
          },
        },
      ],
    };
    const { payload } = buildLiveTranscriptPayload([runningRecord([assistant])]);

    const args =
      (payload?.agents[0]?.messages[0]?.content as { arguments: Record<string, unknown> }[])[0]?.arguments ?? {};
    expect(countUtf8Bytes(JSON.stringify(args))).toBeLessThanOrEqual(MAX_LIVE_DETAILS_UTF8_BYTES + 64);
  });

  it("bounds toolResult details and toolCall arguments", () => {
    const toolResult = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "bash",
      content: [{ type: "text", text: "ok" }],
      details: { stdout: "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES + 100) },
    };
    const assistant = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-1",
          name: "bash",
          arguments: { command: "x".repeat(MAX_LIVE_DETAILS_STRING_UTF8_BYTES + 100) },
        },
      ],
    };
    const { payload } = buildLiveTranscriptPayload([runningRecord([toolResult, assistant])]);

    const messages = payload?.agents[0]?.messages ?? [];
    const emittedResult = messages.find((m) => m.role === "toolResult");
    expect(countUtf8Bytes(JSON.stringify(emittedResult?.details))).toBeLessThanOrEqual(
      MAX_LIVE_DETAILS_STRING_UTF8_BYTES + 64,
    );
    const emittedCall = messages.find((m) => m.role === "assistant");
    const args = (emittedCall?.content as { arguments: Record<string, unknown> }[])[0]?.arguments ?? {};
    expect(countUtf8Bytes(JSON.stringify(args))).toBeLessThanOrEqual(MAX_LIVE_DETAILS_STRING_UTF8_BYTES + 64);
  });

  it("keeps multibyte message content intact and byte-accurate", () => {
    const { payload } = buildLiveTranscriptPayload([runningRecord([textMessage("assistant", "你".repeat(10))])]);
    const content = payload?.agents[0]?.messages[0]?.content;
    const text = Array.isArray(content) ? (content[0] as { text: string }).text : (content as string);
    expect(text).toBe("你".repeat(10));
    expect(countLiveMessageUtf8Bytes(payload?.agents[0]?.messages[0] as never)).toBe(
      countUtf8Bytes(JSON.stringify(payload?.agents[0]?.messages[0])),
    );
  });
});
