import { describe, expect, it } from "vitest";
import { MAX_PER_TAB_AGGREGATE_UTF8_BYTES, countMessageUtf8Bytes } from "./agentChatBudget";
import { MAX_MESSAGES_PER_TAB, trimSessionMessages } from "./agentChatRetention";
import type { AgentMessage } from "./agentChatTypes";

function createOwner(id: string, ...callIds: string[]): AgentMessage {
  return {
    id,
    role: "assistant",
    content: callIds.map((callId) => ({ type: "toolCall", id: callId, name: "read", arguments: {} })),
  };
}

function createResult(id: string, callId: string): AgentMessage {
  return { id, role: "toolResult", toolCallId: callId, toolName: "read", content: "result" };
}

function createFillers(count: number): AgentMessage[] {
  return Array.from({ length: count }, (_, index) => ({ id: `filler-${index}`, role: "user", content: "text" }));
}

function expectWithinBudget(messages: AgentMessage[]): void {
  expect(messages.length).toBeLessThanOrEqual(MAX_MESSAGES_PER_TAB);
  expect(messages.reduce((bytes, message) => bytes + countMessageUtf8Bytes(message), 0)).toBeLessThanOrEqual(
    MAX_PER_TAB_AGGREGATE_UTF8_BYTES,
  );
}

describe("association retention slice A", () => {
  it("drops both sides when the count suffix excludes the owner, without refilling", () => {
    const owner = createOwner("owner", "call");
    const toolResult = createResult("result", "call");
    const fillers = createFillers(MAX_MESSAGES_PER_TAB - 1);
    const kept = trimSessionMessages([owner, ...fillers, toolResult]);

    expect(kept).toEqual(fillers);
    expectWithinBudget(kept);
    const complete = [owner, ...fillers.slice(1), toolResult];
    expect(trimSessionMessages(complete)).toEqual(complete);
    expectWithinBudget(complete);
  });

  it("drops a result when the byte suffix excludes its large owner without pulling it back", () => {
    const owner = createOwner("owner", "call");
    owner.content = [
      { type: "text", text: "x".repeat(MAX_PER_TAB_AGGREGATE_UTF8_BYTES) },
      { type: "toolCall", id: "call", name: "read", arguments: {} },
    ];
    const toolResult = createResult("result", "call");
    const tail = createFillers(1);
    const kept = trimSessionMessages([owner, toolResult, ...tail]);

    expect(kept).toEqual(tail);
    expectWithinBudget(kept);
    const complete = [createOwner("small-owner", "call"), toolResult, ...tail];
    expect(trimSessionMessages(complete)).toEqual(complete);
    expectWithinBudget(complete);
  });

  it("can drop a lone oversized result from an incomplete known pair", () => {
    const toolResult = createResult("result", "call");
    toolResult.content = "x".repeat(MAX_PER_TAB_AGGREGATE_UTF8_BYTES + 1);
    expect(trimSessionMessages([createOwner("owner", "call"), toolResult])).toEqual([]);
    expect(trimSessionMessages([toolResult])).toEqual([toolResult]);
  });
});

describe("association retention slice B", () => {
  it("removes a whole overlapping multi-call component while keeping an independent parallel pair", () => {
    const outside = createOwner("outside", "a");
    const first = createOwner("first", "a", "b");
    const second = createOwner("second", "b", "c");
    const connected = [
      first,
      second,
      createResult("a-result", "a"),
      createResult("b-result", "b"),
      createResult("c-result", "c"),
    ];
    const parallel = [createOwner("parallel", "d"), createResult("d-result", "d")];
    const fillers = createFillers(MAX_MESSAGES_PER_TAB - connected.length - parallel.length);
    const messages = [outside, ...fillers, ...connected, ...parallel];
    const before = structuredClone(messages);
    const kept = trimSessionMessages(messages);

    expect(kept.map((message) => message.id)).toEqual([...fillers, ...parallel].map((message) => message.id));
    expectWithinBudget(kept);
    expect(messages).toEqual(before);
    expect(kept.every((message) => messages.includes(message))).toBe(true);
    expect(trimSessionMessages(connected)).toEqual(connected);
  });

  it("handles result-first and duplicate owners/results, including repeated message IDs", () => {
    const outside = createResult("duplicate-result", "call");
    const inside = [
      createResult("duplicate-result", "call"),
      createOwner("duplicate-owner", "call"),
      createOwner("duplicate-owner", "call"),
    ];
    const fillers = createFillers(MAX_MESSAGES_PER_TAB - inside.length);
    const kept = trimSessionMessages([outside, ...fillers, ...inside]);

    expect(kept.map((message) => message.id)).toEqual(fillers.map((message) => message.id));
    expectWithinBudget(kept);
    expect(trimSessionMessages([outside, ...inside])).toEqual([outside, ...inside]);
  });

  it("preserves true orphans, pending owners and non-tool messages without name-based association", () => {
    const outside = createOwner("outside", "known");
    const orphan = createResult("orphan", "Known");
    const pending = createOwner("pending", "pending-call");
    const noCallId: AgentMessage = { id: "no-call-id", role: "toolResult", content: "standalone" };
    const noTool: AgentMessage = { id: "text", role: "assistant", content: [{ type: "text", text: "hello" }] };
    const tail = [orphan, pending, noCallId, noTool];
    const fillers = createFillers(MAX_MESSAGES_PER_TAB - tail.length);
    const messages = [outside, ...fillers, ...tail];
    const before = structuredClone(messages);

    expect(trimSessionMessages(messages)).toEqual([...fillers, ...tail]);
    expect(messages).toEqual(before);
    expect(trimSessionMessages(tail, new Set([orphan.id, noCallId.id]))).toEqual([pending, noCallId, noTool]);
    expect(trimSessionMessages([])).toEqual([]);
  });

  it("preserves the lone oversized-message exception for an unrelated message or pending owner", () => {
    const oversized: AgentMessage = {
      id: "large",
      role: "user",
      content: "x".repeat(MAX_PER_TAB_AGGREGATE_UTF8_BYTES + 1),
    };
    const pending = createOwner("pending", "pending-call");
    pending.content = [
      { type: "text", text: oversized.content.toString() },
      { type: "toolCall", id: "pending-call", name: "read", arguments: {} },
    ];
    expect(trimSessionMessages([oversized])).toEqual([oversized]);
    expect(trimSessionMessages([pending])).toEqual([pending]);
  });
});
