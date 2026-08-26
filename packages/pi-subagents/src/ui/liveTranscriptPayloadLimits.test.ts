import { describe, expect, it } from "vitest";

import type { AgentRecord } from "../agents/types";
import {
  MAX_LIVE_AGGREGATE_UTF8_BYTES,
  MAX_LIVE_DETAILS_ITEMS,
  MAX_LIVE_DETAILS_UTF8_BYTES,
  MAX_LIVE_PAYLOAD_OVERHEAD_BYTES,
  MAX_LIVE_PER_CHILD_UTF8_BYTES,
  MAX_LIVE_PER_MESSAGE_UTF8_BYTES,
  countUtf8Bytes,
} from "./liveTranscriptBudget";
import { countLiveMessageUtf8Bytes } from "./liveTranscriptMessage";
import { buildLiveTranscriptPayload } from "./liveTranscriptPayload";

function runningRecord(messages: unknown[]): AgentRecord {
  return {
    id: "agent-1",
    agentName: "Explore",
    prompt: "Inspect auth",
    status: "running",
    mode: "foreground",
    createdAt: 1,
    sessionId: "child-session-1",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    session: { messages, thinkingLevel: "low" } as never,
  };
}

function textMessage(role: "assistant", text: string): Record<string, unknown> {
  return { role, content: [{ type: "text", text }] };
}

describe("buildLiveTranscriptPayload byte limits", () => {
  it("does not serialize oversized tool-call IDs and names beyond the aggregate ceiling", () => {
    const oversizedField = "x".repeat(MAX_LIVE_PER_MESSAGE_UTF8_BYTES);
    const assistant = {
      role: "assistant",
      content: Array.from({ length: MAX_LIVE_DETAILS_ITEMS }, () => ({
        type: "toolCall",
        id: oversizedField,
        name: oversizedField,
        arguments: {},
      })),
    };
    const { payload } = buildLiveTranscriptPayload([runningRecord([assistant])]);

    expect(countUtf8Bytes(JSON.stringify(payload))).toBeLessThanOrEqual(
      MAX_LIVE_AGGREGATE_UTF8_BYTES + MAX_LIVE_PAYLOAD_OVERHEAD_BYTES,
    );
  });
  it("drops matching tool results when assistant content capping omits their tool calls", () => {
    const retainedField = "x".repeat(4096);
    const assistant = {
      role: "assistant",
      content: Array.from({ length: MAX_LIVE_DETAILS_ITEMS }, (_, index) => ({
        type: "toolCall",
        id: `call-${index}-${retainedField}`,
        name: retainedField,
        arguments: {},
      })),
    };
    const droppedCallId = `call-${MAX_LIVE_DETAILS_ITEMS - 1}-${retainedField}`;
    const matchingResult = {
      role: "toolResult",
      toolCallId: droppedCallId,
      toolName: "bash",
      content: [{ type: "text", text: "done" }],
    };
    const { payload } = buildLiveTranscriptPayload([runningRecord([assistant, matchingResult])]);

    const messages = payload?.agents[0]?.messages ?? [];
    expect(messages.some((message) => message.role === "toolResult" && message.toolCallId === droppedCallId)).toBe(
      false,
    );
  });

  it("drops an oversized single assistant multi-tool-call record to enforce the child byte ceiling", () => {
    const assistant = {
      role: "assistant",
      content: Array.from({ length: MAX_LIVE_DETAILS_ITEMS }, (_, index) => ({
        type: "toolCall",
        id: `call-${index}`,
        name: "bash",
        arguments: { command: "x".repeat(MAX_LIVE_DETAILS_UTF8_BYTES) },
      })),
    };
    const { payload } = buildLiveTranscriptPayload([runningRecord([assistant])]);

    const messages = payload?.agents[0]?.messages ?? [];
    const childBytes = messages.reduce((sum, message) => sum + countLiveMessageUtf8Bytes(message), 0);
    expect(childBytes).toBeLessThanOrEqual(MAX_LIVE_PER_CHILD_UTF8_BYTES);
    expect(countUtf8Bytes(JSON.stringify(payload))).toBeLessThanOrEqual(
      MAX_LIVE_AGGREGATE_UTF8_BYTES + MAX_LIVE_PAYLOAD_OVERHEAD_BYTES,
    );
  });

  it("drops an oversized tool association group while retaining newer unrelated messages within byte limits", () => {
    const assistantCalls = {
      role: "assistant",
      content: Array.from({ length: 40 }, (_, index) => ({
        type: "toolCall",
        id: `call-${index}`,
        name: "bash",
        arguments: { command: "x".repeat(MAX_LIVE_DETAILS_UTF8_BYTES - 32) },
      })),
    };
    const results = Array.from({ length: 4 }, (_, index) => ({
      role: "toolResult",
      toolCallId: `call-${index}`,
      toolName: "bash",
      content: [{ type: "text", text: "r".repeat(MAX_LIVE_PER_MESSAGE_UTF8_BYTES) }],
    }));
    const { payload } = buildLiveTranscriptPayload([
      runningRecord([assistantCalls, ...results, textMessage("assistant", "latest unrelated")]),
    ]);

    const messages = payload?.agents[0]?.messages ?? [];
    const childBytes = messages.reduce((sum, message) => sum + countLiveMessageUtf8Bytes(message), 0);
    expect(childBytes).toBeLessThanOrEqual(MAX_LIVE_PER_CHILD_UTF8_BYTES);
    expect(messages).toEqual([{ role: "assistant", content: [{ type: "text", text: "latest unrelated" }] }]);
    expect(countUtf8Bytes(JSON.stringify(payload))).toBeLessThanOrEqual(
      MAX_LIVE_AGGREGATE_UTF8_BYTES + MAX_LIVE_PAYLOAD_OVERHEAD_BYTES,
    );
  });
});
