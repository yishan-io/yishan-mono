import { describe, expect, it } from "vitest";
import { buildTurnContent, summarizeToolGroup } from "./groups";
import type { AssistantObservation } from "./types";

const source = { id: "a", stability: "stable", origin: "snapshot" } as const;
const assistant = (blocks: AssistantObservation["blocks"]): AssistantObservation => ({
  kind: "assistant",
  source,
  blocks,
  isStreaming: false,
});

describe("structure groups", () => {
  it("holds working thinking across narration, splits on text, and leaves trailing thoughts standalone", () => {
    const content = buildTurnContent([
      assistant([
        { kind: "thinking", text: "plan" },
        { kind: "text", text: "checking" },
        { kind: "tool", callId: "one" },
        { kind: "text", text: "between" },
        { kind: "tool", callId: "two" },
        { kind: "thinking", text: "after" },
        { kind: "text", text: "done" },
      ]),
    ]);
    expect(content.blocks.map((block) => block.kind)).toEqual(["text", "toolGroup", "text", "toolGroup", "thinking"]);
    expect(content.blocks[1]).toMatchObject({
      members: [
        { kind: "thinking", text: "plan" },
        { kind: "tool", callId: "one" },
      ],
    });
    expect(content.summary).toEqual({ text: "done", thinking: [], isStreaming: false });
  });

  it("never turns thinking-only runs into tool groups and keeps final-answer thinking with the summary", () => {
    const content = buildTurnContent([
      assistant([{ kind: "thinking", text: "earlier" }]),
      {
        ...assistant([
          { kind: "thinking", text: "final thought" },
          { kind: "text", text: " answer " },
        ]),
        source: { ...source, id: "b" },
      },
    ]);
    expect(content.blocks.map((block) => block.kind)).toEqual(["thinking"]);
    expect(content.summary).toMatchObject({ text: "answer", thinking: [{ text: "final thought" }] });
    expect(buildTurnContent([assistant([{ kind: "thinking", text: " " }])]).blocks).toEqual([]);
  });
});

describe("association groups", () => {
  it("counts distinct calls, keeps member order, and leaves absent facts unknown", () => {
    const group = buildTurnContent([
      assistant([
        { kind: "thinking", text: "plan" },
        { kind: "tool", callId: "x" },
        { kind: "tool", callId: "x" },
        { kind: "tool", callId: "y" },
      ]),
    ]).blocks[0];
    if (group?.kind !== "toolGroup") throw new Error("expected group");
    const summarized = summarizeToolGroup(
      group,
      new Map([["s", new Map([["x", { sessionId: "s", callId: "x", executionState: "interrupted" }]])]]),
      "s",
    );
    expect(summarized.members).toEqual(group.members);
    expect(summarized.callCount).toBe(2);
    expect(summarized.stateCounts).toEqual({
      unknown: 1,
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      interrupted: 1,
    });
    expect(group.stateCounts.interrupted).toBe(0);
  });
});
