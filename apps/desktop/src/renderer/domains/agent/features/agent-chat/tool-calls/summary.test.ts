// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { summarizeToolCalls } from "./summary";

describe("summarizeToolCalls", () => {
  it("groups read and bash calls with counts", () => {
    const calls = [
      { toolCall: { id: "1", name: "read", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "2", name: "read", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "3", name: "bash", type: "toolCall" as const, arguments: {} } },
    ];

    expect(summarizeToolCalls(calls)).toEqual([
      { key: "read", count: 2 },
      { key: "bash", count: 1 },
    ]);
  });

  it("keeps first-seen category order", () => {
    const calls = [
      { toolCall: { id: "1", name: "bash", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "2", name: "read", type: "toolCall" as const, arguments: {} } },
    ];

    expect(summarizeToolCalls(calls)).toEqual([
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

    expect(summarizeToolCalls(calls)).toEqual([
      { key: "edited", count: 2 },
      { key: "searched", count: 1 },
    ]);
  });

  it("lists unknown tools by name", () => {
    const calls = [
      { toolCall: { id: "1", name: "web_fetch", type: "toolCall" as const, arguments: {} } },
      { toolCall: { id: "2", name: "web_fetch", type: "toolCall" as const, arguments: {} } },
    ];

    expect(summarizeToolCalls(calls)).toEqual([{ key: "used", count: 2, toolName: "web_fetch" }]);
  });
});
