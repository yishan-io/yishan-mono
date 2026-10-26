// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseSubagentLiveTranscripts } from "./agentChatSubagentEvents";
import { parseSubagentSnapshotMessages } from "./agentChatSubagentSnapshot";

const filler = () => Array.from({ length: 99 }, (_, index) => ({ id: `f-${index}`, role: "user", content: "f" }));
const owner = (...ids: string[]) => ({
  id: "duplicate",
  role: "assistant",
  content: ids.map((id) => ({ type: "toolCall", id, name: "tool", arguments: {} })),
});
const result = (id: string) => ({ id: "duplicate", role: "toolResult", toolCallId: id, content: "ok" });
function parse(messages: unknown[], status?: unknown) {
  return parseSubagentLiveTranscripts({
    method: "setWidget",
    widgetKey: "pi-subagents-live-transcripts",
    widgetLines: [JSON.stringify({ version: 1, agents: [{ childSessionId: "child", messages, status }] })],
  })?.[0];
}

describe("raw subagent snapshot windows", () => {
  it.each([
    [owner("a"), ...filler(), result("a")],
    [result("a"), ...filler(), owner("a")],
    [owner("a"), ...filler().slice(2), owner("a", "b"), result("a"), result("b")],
    [owner("a"), ...filler().slice(1), result("a"), result("a")],
  ])("drops split components without refilling or merging duplicate display IDs", (...messages) => {
    const snapshot = parse(messages);
    expect(snapshot?.messages.every((message) => message.id.startsWith("f-"))).toBe(true);
    expect(snapshot?.coverage).toEqual({
      completeness: "partial",
      omittedMessages: messages.length - (snapshot?.messages.length ?? 0),
      reasons: ["messageLimit", "association"],
    });
  });

  it("keeps true orphans and pending owners, counting only locally omitted messages", () => {
    const snapshot = parse([null, { role: "bad" }, result("orphan"), owner("pending")]);
    expect(snapshot?.messages).toHaveLength(2);
    expect(snapshot?.coverage).toEqual({ completeness: "partial", omittedMessages: 2, reasons: ["invalidMessage"] });
  });

  it.each(["queued", "starting", "running", "bad", undefined, null])(
    "only preserves explicit valid status %s",
    (status) => {
      const snapshot = parse([], status);
      expect(snapshot?.status).toBe(["queued", "starting", "running"].includes(String(status)) ? status : undefined);
      expect(snapshot?.coverage).toEqual({ completeness: "unknown", omittedMessages: 0, reasons: [] });
    },
  );

  it("preserves unknown sender and field-loss boundaries", () => {
    expect(parse([{ role: "user", content: "…[truncated]" }])?.coverage).toEqual({
      completeness: "unknown",
      omittedMessages: 0,
      reasons: [],
    });
  });

  it("distinguishes a widget clear from malformed input", () => {
    const event = { method: "setWidget", widgetKey: "pi-subagents-live-transcripts" };
    expect(parseSubagentLiveTranscripts(event)).toEqual([]);
    for (const payload of [null, {}, { version: 2, agents: [] }]) {
      expect(parseSubagentLiveTranscripts({ ...event, widgetLines: [JSON.stringify(payload)] })).toBeNull();
    }
  });
});

it("does not access payload fields outside the safe raw window", () => {
  const excluded = {
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: "a",
        get arguments(): never {
          throw new Error("outside arguments read");
        },
        get name(): never {
          throw new Error("outside name read");
        },
      },
    ],
    get details(): never {
      throw new Error("outside details read");
    },
  };
  const snapshot = parseSubagentSnapshotMessages([excluded, ...filler(), result("a")]);
  expect(snapshot.messages).toHaveLength(99);
  expect(snapshot.coverage.omittedMessages).toBe(2);
});
