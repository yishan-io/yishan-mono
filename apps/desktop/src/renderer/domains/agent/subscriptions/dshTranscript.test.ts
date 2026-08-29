import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parseDSHFrontendPayload, projectDSHTranscript } from "./dshTranscript";

const user = { id: "u", role: "user", content: [{ type: "text", text: "hello" }], source: { kind: "user" } };
const assistant = {
  id: "a",
  role: "assistant",
  content: [{ type: "text", text: "answer" }],
  source: { kind: "model", provider: "deepseek", model: "deepseek-chat" },
};

describe("DSH transcript", () => {
  it("projects surface replacements, tool calls, and usage", () => {
    const result = projectDSHTranscript([
      { type: "user/message", seq: 0, time: 1, data: user, surfaceOp: "append" },
      {
        type: "assistant/message",
        seq: 1,
        time: 2,
        data: { turn: 0, step: 0, message: assistant, usage: { inputTokens: 2, outputTokens: 3 } },
        surfaceOp: "append",
      },
      {
        type: "tool/result",
        seq: 2,
        time: 3,
        data: {
          turn: 0,
          step: 0,
          message: {
            id: "r",
            role: "user",
            content: [{ type: "tool-result", toolCallId: "call", content: [{ type: "text", text: "done" }] }],
            source: { kind: "tool", callId: "call" },
          },
        },
        surfaceOp: "append",
      },
      {
        type: "assistant/message",
        seq: 3,
        time: 4,
        data: { turn: 0, step: 1, message: { ...assistant, id: "compact" } },
        surfaceOp: { op: "replace", start: 0, end: 2 },
        sourceEventSeqs: [0, 1, 2],
      },
    ]);
    expect(result).toEqual([
      { id: "compact", role: "assistant", content: [{ type: "text", text: "answer" }], timestamp: 4 },
    ]);
  });
  it("rejects a replacement whose provenance omits a replaced surface event", () => {
    expect(() =>
      projectDSHTranscript([
        { type: "user/message", seq: 0, time: 1, data: user, surfaceOp: "append" },
        {
          type: "assistant/message",
          seq: 1,
          time: 2,
          data: { turn: 0, step: 0, message: assistant },
          surfaceOp: "append",
        },
        {
          type: "tool/result",
          seq: 2,
          time: 3,
          data: {
            turn: 0,
            step: 0,
            message: {
              id: "r",
              role: "user",
              content: [{ type: "tool-result", toolCallId: "call", content: [] }],
              source: { kind: "tool", callId: "call" },
            },
          },
          surfaceOp: "append",
        },
        {
          type: "assistant/message",
          seq: 3,
          time: 4,
          data: { turn: 0, step: 1, message: { ...assistant, id: "compact" } },
          surfaceOp: { op: "replace", start: 0, end: 2 },
          sourceEventSeqs: [0, 2],
        },
      ]),
    ).toThrow("DSH surface replacement provenance is invalid");
  });
  it("rejects unknown required events and skips ignorable ones", () => {
    expect(() => projectDSHTranscript([{ type: "future/event", seq: 0, time: 1, data: {} }])).toThrow(
      "Unknown required",
    );
    expect(projectDSHTranscript([{ type: "future/event", seq: 0, time: 1, data: {}, ignorable: true }])).toEqual([]);
  });
  it("preserves unknown required wire events so the controller can reload", () => {
    const payload = parseDSHFrontendPayload({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: {
        event: { sessionId: "session", seq: 0, event: { type: "future/event", seq: 0, time: 0, data: {} } },
      },
    });
    expect(payload?.update.event?.type).toBe("future/event");
    expect(payload?.update.event).not.toHaveProperty("ignorable");
  });
  it("accepts the daemon session-update event envelope fixture", () => {
    const fixture: unknown = JSON.parse(
      readFileSync(new URL("./fixtures/dshFrontendEvent.json", import.meta.url), "utf8"),
    );
    expect(parseDSHFrontendPayload(fixture)).toMatchObject({ sessionId: "session", update: { event: { seq: 0 } } });
  });

  it("accepts rc.2 event fixtures with all required event and metadata fields", () => {
    const events: unknown[] = JSON.parse(
      readFileSync(new URL("./fixtures/dshRc2Events.json", import.meta.url), "utf8"),
    );
    const parsedEvents = events.map((event) =>
      parseDSHFrontendPayload({
        sessionId: "session",
        tabId: "tab",
        workspaceId: "workspace",
        instanceId: "inc",
        update: { event: { sessionId: "session", seq: (event as { seq: number }).seq, event } },
      }),
    );
    expect(parsedEvents).not.toContain(null);
    expect(
      projectDSHTranscript(parsedEvents.flatMap((payload) => (payload?.update.event ? [payload.update.event] : []))),
    ).toHaveLength(4);
  });
  it("rejects missing rc.2 fields and forbidden metadata", () => {
    const parseEvent = (event: unknown) =>
      parseDSHFrontendPayload({
        sessionId: "s",
        tabId: "t",
        workspaceId: "w",
        instanceId: "i",
        update: { event: { sessionId: "s", seq: 0, event } },
      });
    expect(parseEvent({ type: "turn/end", seq: 0, time: 0, data: { turn: 0 } })).toBeNull();
    expect(
      parseEvent({
        type: "assistant/chunk",
        seq: 0,
        time: 0,
        data: { turn: 0, chunk: { type: "text-delta", index: 0, text: "x" } },
      }),
    ).toBeNull();
    expect(parseEvent({ type: "todo/write", seq: 0, time: 0, data: { turn: 0, todos: [] } })).toBeNull();
    expect(parseEvent({ type: "request/header", seq: 0, time: 0, data: { header: {}, reason: "initial" } })).toBeNull();
    expect(parseEvent({ type: "turn/start", seq: 0, time: 0, data: { turn: 0 }, surfaceOp: "append" })).toBeNull();
    expect(
      parseEvent({
        type: "user/message",
        seq: 0,
        time: 0,
        data: {
          id: "injected",
          role: "user",
          content: [{ type: "text", text: "Injected context" }],
          source: { kind: "model", provider: "deepseek", model: "deepseek-chat" },
        },
        surfaceOp: "append",
      }),
    ).not.toBeNull();
    expect(
      parseEvent({
        type: "user/message",
        seq: 0,
        time: 0,
        data: {
          id: "skill-catalog",
          role: "user",
          content: [{ type: "text", text: "Available skills" }],
          source: { kind: "skill-catalog", form: "catalog", entries: [] },
        },
        surfaceOp: "append",
      }),
    ).not.toBeNull();
  });
  it("accepts exact lifecycle hints only when their parent and instanceId match the envelope", () => {
    const envelope = { sessionId: "parent", tabId: "tab", workspaceId: "workspace", instanceId: "inc" };
    const lifecycle = {
      version: 1,
      parentSessionId: "parent",
      instanceId: "inc",
      revision: 7,
      event: "started",
      runId: "run",
      childSessionId: "child",
      provider: "pi",
      local: true,
    };
    expect(parseDSHFrontendPayload({ ...envelope, update: { lifecycle } })).toMatchObject({ update: { lifecycle } });
    expect(
      parseDSHFrontendPayload({
        ...envelope,
        update: { lifecycle: { ...lifecycle, event: "finished", stopReason: "completed" } },
      }),
    ).not.toBeNull();
    expect(
      parseDSHFrontendPayload({
        ...envelope,
        update: { lifecycleResync: { parentSessionId: "parent", instanceId: "inc", revision: 7 } },
      }),
    ).not.toBeNull();
    expect(
      parseDSHFrontendPayload({ ...envelope, update: { lifecycle: { ...lifecycle, parentSessionId: "other" } } }),
    ).toBeNull();
    expect(
      parseDSHFrontendPayload({ ...envelope, update: { lifecycle: { ...lifecycle, instanceId: "other" } } }),
    ).toBeNull();
    expect(
      parseDSHFrontendPayload({
        ...envelope,
        update: { lifecycle: { ...lifecycle, revision: Number.MAX_SAFE_INTEGER + 1 } },
      }),
    ).toBeNull();
    expect(
      parseDSHFrontendPayload({
        ...envelope,
        update: { lifecycle: { ...lifecycle, event: "started", stopReason: "completed" } },
      }),
    ).toBeNull();
    expect(
      parseDSHFrontendPayload({ ...envelope, update: { lifecycle: { ...lifecycle, event: "finished" } } }),
    ).toBeNull();
    expect(
      parseDSHFrontendPayload({ ...envelope, update: { lifecycle: { ...lifecycle, unexpected: true } } }),
    ).toBeNull();
    expect(
      parseDSHFrontendPayload({
        ...envelope,
        update: { lifecycle, lifecycleResync: { parentSessionId: "parent", instanceId: "inc", revision: 7 } },
      }),
    ).toBeNull();
  });
  it("strictly validates the frontend envelope and safe sequence", () => {
    expect(
      parseDSHFrontendPayload({
        sessionId: "s",
        tabId: "t",
        workspaceId: "w",
        instanceId: "i",
        update: {
          event: { sessionId: "s", seq: 0, event: { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } } },
        },
      }),
    ).not.toBeNull();
    expect(
      parseDSHFrontendPayload({
        sessionId: "s",
        tabId: "t",
        workspaceId: "w",
        instanceId: "i",
        update: {
          event: { sessionId: "s", seq: -1, event: { type: "turn/start", seq: -1, time: 1, data: { turn: 1 } } },
        },
      }),
    ).toBeNull();
  });
  it("requires one exact canonical update and validates replacement provenance", () => {
    const payload = {
      sessionId: "s",
      tabId: "t",
      workspaceId: "w",
      instanceId: "i",
      update: {
        event: {
          sessionId: "s",
          seq: 3,
          event: {
            type: "assistant/message",
            seq: 3,
            time: 3,
            data: { turn: 0, step: 0, message: assistant },
            surfaceOp: { op: "replace", start: 1, end: 2 },
            sourceEventSeqs: [1, 2],
          },
        },
      },
    };
    expect(parseDSHFrontendPayload(payload)).not.toBeNull();
    expect(parseDSHFrontendPayload({ ...payload, extra: true })).toBeNull();
    expect(parseDSHFrontendPayload({ ...payload, update: { unavailable: false } })).toBeNull();
    expect(parseDSHFrontendPayload({ ...payload, update: { event: { ...payload.update.event, seq: 2 } } })).toBeNull();
    expect(
      parseDSHFrontendPayload({
        ...payload,
        update: { event: { ...payload.update.event, event: { ...payload.update.event.event, sourceEventSeqs: [1] } } },
      }),
    ).toBeNull();
    expect(
      parseDSHFrontendPayload({
        ...payload,
        update: { event: { ...payload.update.event, event: { ...payload.update.event.event, unknown: true } } },
      }),
    ).toBeNull();
    expect(
      parseDSHFrontendPayload({
        ...payload,
        update: {
          event: {
            ...payload.update.event,
            event: { ...payload.update.event.event, surfaceOp: "append", sourceEventSeqs: [] },
          },
        },
      }),
    ).not.toBeNull();
    expect(
      parseDSHFrontendPayload({
        ...payload,
        update: {
          event: {
            ...payload.update.event,
            event: {
              type: "user/message",
              seq: 3,
              time: 3,
              data: user,
              surfaceOp: "append",
              sourceEventSeqs: [],
            },
          },
        },
      }),
    ).toBeNull();
  });
});
