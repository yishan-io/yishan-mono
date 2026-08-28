import { describe, expect, it } from "vitest";

import { parseAgentHistoryResult } from "./daemonAgentHistoryParser";

describe("parseAgentHistoryResult", () => {
  const request = { runtime: "dsh" as const, sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" };
  const dshHistory = {
    runtime: "dsh",
    dsh: {
      session: { sessionId: "session-1", createdAt: 1 },
      events: [{ type: "turn/end", seq: 0, time: 1, data: {} }],
      incarnation: "run-1",
      asOfSeq: 0,
      durableThroughSeq: 0,
    },
  };

  it("parses exact DSH history for the requested session", () => {
    expect(parseAgentHistoryResult(dshHistory, request)).toEqual(dshHistory);
  });

  it("allows persisted user and assistant surface events for controller reload validation", () => {
    const history = {
      ...dshHistory,
      dsh: {
        ...dshHistory.dsh,
        events: [
          {
            type: "user/message",
            seq: 0,
            time: 1,
            data: {
              message: {
                id: "user-1",
                role: "user",
                content: [{ type: "text", text: "Hello" }],
                source: { kind: "user" },
              },
            },
            ignorable: true,
            sourceEventSeqs: [],
            surfaceOp: "append",
          },
          {
            type: "assistant/message",
            seq: 1,
            time: 2,
            data: {
              turn: 0,
              step: 0,
              message: {
                id: "assistant-1",
                role: "assistant",
                content: [{ type: "text", text: "Hi" }],
                source: { kind: "model", provider: "test", model: "test" },
              },
            },
            sourceEventSeqs: [],
            surfaceOp: "append",
          },
        ],
        asOfSeq: 1,
        durableThroughSeq: 1,
      },
    };

    expect(parseAgentHistoryResult(history, request)).toEqual(history);
  });

  it("parses only Pi's exact tagged file path branch", () => {
    expect(
      parseAgentHistoryResult(
        { runtime: "pi", pi: { filePath: "/workspace/.pi/session.jsonl" } },
        { ...request, runtime: "pi" },
      ),
    ).toEqual({ runtime: "pi", pi: { filePath: "/workspace/.pi/session.jsonl" } });
  });

  it.each([
    ["wrong runtime", { ...dshHistory, runtime: "pi" }],
    ["wrong session", { ...dshHistory, dsh: { ...dshHistory.dsh, session: { sessionId: "other", createdAt: 1 } } }],
    ["empty incarnation", { ...dshHistory, dsh: { ...dshHistory.dsh, incarnation: "" } }],
    ["unequal cursors", { ...dshHistory, dsh: { ...dshHistory.dsh, durableThroughSeq: -1 } }],
    [
      "non-contiguous events",
      { ...dshHistory, dsh: { ...dshHistory.dsh, events: [{ type: "turn/end", seq: 1, time: 1, data: {} }] } },
    ],
    ["invalid event core", { ...dshHistory, dsh: { ...dshHistory.dsh, events: [{ seq: 0 }] } }],
  ])("rejects %s", (_name, payload) => {
    expect(() => parseAgentHistoryResult(payload, request)).toThrow();
  });

  it("rejects malformed Pi payloads", () => {
    expect(() =>
      parseAgentHistoryResult({ runtime: "pi", pi: { filePath: 1 } }, { ...request, runtime: "pi" }),
    ).toThrow();
    expect(() =>
      parseAgentHistoryResult({ runtime: "pi", dsh: dshHistory.dsh }, { ...request, runtime: "pi" }),
    ).toThrow();
  });
});
