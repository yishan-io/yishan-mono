import { describe, expect, it } from "vitest";
import { MAX_SUBAGENT_AGGREGATE_UTF8_BYTES } from "./agentChatBudget";
import { trimSubagentLiveTranscripts } from "./agentChatRetention";
import type { AgentMessage } from "./agentChatTypes";

const filler = (): AgentMessage[] =>
  Array.from({ length: 99 }, (_, index) => ({ id: `f-${index}`, role: "user", content: "f" }));
const owner = (...ids: string[]): AgentMessage => ({
  id: "duplicate",
  role: "assistant",
  content: ids.map((id) => ({ type: "toolCall", id, name: "tool", arguments: {} })),
});
const result = (id: string): AgentMessage => ({ id: "duplicate", role: "toolResult", toolCallId: id, content: "ok" });

describe("normalized child count windows", () => {
  it.each([
    [owner("a"), ...filler(), result("a")],
    [result("a"), ...filler(), owner("a")],
    [owner("a"), ...filler().slice(2), owner("a", "b"), result("a"), result("b")],
    [owner("a"), ...filler().slice(1), result("a"), result("a")],
  ])("removes split associations without refill and leaves input unchanged", (...messages) => {
    const original = structuredClone(messages);
    const retained = trimSubagentLiveTranscripts({ child: messages }).child;
    expect(retained).toEqual(messages.filter((message) => message.id.startsWith("f-")));
    expect(messages).toEqual(original);
  });

  it("keeps true orphans, pending calls, and complete associations", () => {
    const messages = [result("orphan"), owner("pending"), result("complete"), owner("complete")];
    expect(trimSubagentLiveTranscripts({ child: messages }).child).toEqual(messages);
  });

  it("keeps the last 20 alphabetically sorted children", () => {
    const transcripts = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`child-${String(index).padStart(2, "0")}`, filler()]),
    );
    const retained = trimSubagentLiveTranscripts(transcripts);
    expect(Object.keys(retained)).toEqual(Object.keys(transcripts).sort().slice(-20));
    expect(Object.keys(transcripts)).toHaveLength(21);
  });

  it("retains the aggregate budget boundary and at least one oversized child", () => {
    const message = (id: string, bytes: number): AgentMessage => ({ id, role: "user", content: "x".repeat(bytes) });
    const half = MAX_SUBAGENT_AGGREGATE_UTF8_BYTES / 2;
    const transcripts = { a: [message("a", 1)], b: [message("b", half)], c: [message("c", half)] };
    expect(Object.keys(trimSubagentLiveTranscripts(transcripts))).toEqual(["b", "c"]);
    const oversized = { a: transcripts.a, z: [message("z", MAX_SUBAGENT_AGGREGATE_UTF8_BYTES + 1)] };
    expect(trimSubagentLiveTranscripts(oversized)).toEqual({ z: oversized.z });
  });
});
