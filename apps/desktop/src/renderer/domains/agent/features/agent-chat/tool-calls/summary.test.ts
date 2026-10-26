import { composeTranscript, createTranscriptState } from "@renderer/domains/agent/chat/transcript/compose";
import { projectTranscript } from "@renderer/domains/agent/chat/transcript/presentation";
import type { ToolCallSource } from "@renderer/domains/agent/chat/transcript/toolCalls.types";
import { describe, expect, it } from "vitest";

function projectSummary(calls: { toolCall: { id: string; name: string; arguments: Record<string, unknown> } }[]) {
  const source: ToolCallSource = { id: "summary", origin: "snapshot", isFinal: true, priority: 0 };
  const state = composeTranscript(createTranscriptState({ sessionId: "summary", namespace: "test", seed: 0 }), {
    sessionId: "summary",
    generation: 0,
    update: 0,
    authority: "current",
    isWorking: false,
    observations: [
      {
        kind: "assistant",
        source: { id: "assistant", stability: "stable", origin: "snapshot" },
        isStreaming: false,
        blocks: calls.map(({ toolCall }) => ({ kind: "tool", callId: toolCall.id })),
      },
    ],
    toolOperations: calls.map(({ toolCall }) => ({
      type: "owner",
      sessionId: "summary",
      callId: toolCall.id,
      owner: { name: toolCall.name, arguments: toolCall.arguments, source },
    })),
  });
  const row = projectTranscript(state).rows[0];
  if (row?.kind !== "turn") throw new Error("Expected composed turn");
  const group = row.turn.blocks[0];
  if (group?.kind !== "group") throw new Error("Expected projected group");
  return group.summaryItems;
}

describe("projected tool group summary", () => {
  it("groups read and bash calls with counts", () => {
    const calls = [
      { toolCall: { id: "1", name: "read", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "2", name: "read", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "3", name: "bash", type: "toolCall" as const, arguments: {} } },
    ];

    expect(projectSummary(calls)).toEqual([
      { key: "read", count: 2 },
      { key: "bash", count: 1 },
    ]);
  });

  it("keeps first-seen category order", () => {
    const calls = [
      { toolCall: { id: "1", name: "bash", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "2", name: "read", type: "toolCall" as const, arguments: {} } },
    ];

    expect(projectSummary(calls)).toEqual([
      { key: "bash", count: 1 },
      { key: "read", count: 1 },
    ]);
  });

  it("counts edits, writes and greps into their own categories", () => {
    const calls = [
      { toolCall: { id: "1", name: "edit", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "2", name: "write", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "3", name: "grep", type: "toolCall" as const, arguments: {} } },
    ];

    expect(projectSummary(calls)).toEqual([
      { key: "edited", count: 2 },
      { key: "searched", count: 1 },
    ]);
  });

  it("lists unknown tools by name", () => {
    const calls = [
      { toolCall: { id: "1", name: "web_fetch", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "2", name: "web_fetch", type: "toolCall" as const, arguments: {} } },
    ];

    expect(projectSummary(calls)).toEqual([{ key: "used", count: 2, toolName: "web_fetch" }]);
  });
});
