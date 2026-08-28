import { describe, expect, it } from "vitest";

import {
  parseSessionCancelRequest,
  parseSessionCancelResult,
  parseSessionFlushRequest,
  parseSessionFlushResult,
  parseSessionPromptRequest,
  parseSessionPromptResult,
  parseSessionStartRequest,
  parseSessionStartResult,
  parseSessionSubscribeRequest,
  parseSessionSubscribeResult,
  parseSetModelRequest,
  parseStockSessionPromptRequest,
  parseTranscriptResetNotification,
} from "./executionContracts";

describe("Yishan DSH execution contracts", () => {
  it("accepts a model switch request with an optional provider", () => {
    expect(
      parseSetModelRequest({
        cwd: "/workspace",
        sessionId: "session-1",
        model: "deepseek-v4-flash",
        provider: "deepseek-official",
      }),
    ).toEqual({
      cwd: "/workspace",
      sessionId: "session-1",
      model: "deepseek-v4-flash",
      provider: "deepseek-official",
    });
  });

  it("rejects an empty or non-string supplied provider instead of treating it as a retained provider", () => {
    for (const provider of ["", "   ", 42]) {
      expect(() =>
        parseSetModelRequest({ cwd: "/workspace", sessionId: "session-1", model: "next-model", provider }),
      ).toThrow("provider must be a non-empty string when supplied");
    }
  });

  it("accepts exact cwd-scoped start, text-only prompt, cancel, and flush contracts", () => {
    const binding = {
      version: 1,
      workspaceId: "workspace-1",
      projectId: "",
      organizationId: "",
      ownerNodeId: "node-1",
      cwd: "/workspace",
    };
    expect(parseSessionStartRequest({ cwd: "/workspace", sessionId: "session-1", binding })).toEqual({
      cwd: "/workspace",
      sessionId: "session-1",
      binding,
    });
    expect(parseSessionStartResult({ sessionId: "session-1", incarnation: "run-1" }, "session-1")).toEqual({
      sessionId: "session-1",
      incarnation: "run-1",
    });
    expect(
      parseSessionPromptRequest({
        cwd: "/workspace",
        sessionId: "session-1",
        contentBlocks: [{ type: "text", text: "Hello" }],
      }),
    ).toEqual({
      cwd: "/workspace",
      sessionId: "session-1",
      contentBlocks: [{ type: "text", text: "Hello" }],
    });
    expect(parseSessionPromptResult({ messageId: "message-1" })).toEqual({ messageId: "message-1" });
    expect(parseSessionCancelRequest({ cwd: "/workspace", sessionId: "session-1" })).toEqual({
      cwd: "/workspace",
      sessionId: "session-1",
    });
    expect(parseSessionCancelResult({ sessionId: "session-1", cancelled: true }, "session-1")).toEqual({
      sessionId: "session-1",
      cancelled: true,
    });
    expect(parseSessionFlushRequest({ cwd: "/workspace", sessionId: "session-1" })).toEqual({
      cwd: "/workspace",
      sessionId: "session-1",
    });
    expect(
      parseSessionFlushResult({ sessionId: "session-1", incarnation: "run-1", durableThroughSeq: -1 }, "session-1"),
    ).toMatchObject({ durableThroughSeq: -1 });
  });

  it("parses only the exact stock session prompt compatibility shape", () => {
    expect(
      parseStockSessionPromptRequest({ sessionId: "session-1", contentBlocks: [{ type: "text", text: "Hello" }] }),
    ).toEqual({
      sessionId: "session-1",
      contentBlocks: [{ type: "text", text: "Hello" }],
    });
    expect(() =>
      parseStockSessionPromptRequest({
        sessionId: "session-1",
        contentBlocks: [{ type: "text", text: "Hello", extra: true }],
      }),
    ).toThrow();
    expect(() =>
      parseStockSessionPromptRequest({ sessionId: "session-1", contentBlocks: [{ type: "image", text: "Hello" }] }),
    ).toThrow();
  });

  it("accepts empty reconnect baselines and contiguous event tails", () => {
    const emptyReconnect = {
      sessionId: "session-1",
      incarnation: "run-1",
      events: [],
      asOfSeq: 5,
      durableThroughSeq: 5,
      headSeq: 5,
    };
    expect(parseSessionSubscribeRequest({ cwd: "/workspace", sessionId: "session-1", afterSeq: -1 })).toEqual({
      cwd: "/workspace",
      sessionId: "session-1",
      afterSeq: -1,
    });
    expect(parseSessionSubscribeResult(emptyReconnect, "session-1", 5)).toEqual(emptyReconnect);

    const eventTail = {
      ...emptyReconnect,
      events: [{ seq: 6 }, { seq: 7 }, { seq: 8 }],
      asOfSeq: 8,
      durableThroughSeq: 8,
      headSeq: 8,
    };
    expect(parseSessionSubscribeResult(eventTail, "session-1", 5)).toEqual(eventTail);
  });

  it("rejects malformed or mismatched execution payloads", () => {
    expect(() => parseSessionStartResult({ sessionId: "other", incarnation: "run-1" }, "session-1")).toThrow(
      "sessionId does not match requested session",
    );
    expect(() =>
      parseSessionPromptRequest({
        cwd: "/workspace",
        sessionId: "session-1",
        contentBlocks: [{ type: "image", text: "x" }],
      }),
    ).toThrow("contentBlocks must contain text blocks");
    expect(() =>
      parseSessionPromptRequest({
        cwd: "/workspace",
        sessionId: "session-1",
        contentBlocks: [{ type: "text", text: "x", extra: true }],
      }),
    ).toThrow("prompt content block has unsupported fields");
    expect(() =>
      parseSessionSubscribeResult(
        { sessionId: "other", incarnation: "run-1", events: [], asOfSeq: -1, durableThroughSeq: -1, headSeq: -1 },
        "session-1",
        -1,
      ),
    ).toThrow("sessionId does not match requested session");
    expect(() =>
      parseSessionSubscribeResult(
        {
          sessionId: "session-1",
          incarnation: "run-1",
          events: [{ seq: 0 }, { seq: 2 }],
          asOfSeq: 2,
          durableThroughSeq: 2,
          headSeq: 2,
        },
        "session-1",
        -1,
      ),
    ).toThrow("events must have contiguous sequence numbers");
    expect(() =>
      parseSessionSubscribeResult(
        {
          sessionId: "session-1",
          incarnation: "run-1",
          events: [{ seq: 5 }],
          asOfSeq: 5,
          durableThroughSeq: 5,
          headSeq: 5,
        },
        "session-1",
        5,
      ),
    ).toThrow("events must start at afterSeq plus one");
    expect(() =>
      parseSessionSubscribeResult(
        {
          sessionId: "session-1",
          incarnation: "run-1",
          events: [],
          asOfSeq: 6,
          durableThroughSeq: 6,
          headSeq: 6,
        },
        "session-1",
        5,
      ),
    ).toThrow("empty events require asOfSeq to equal afterSeq");
    expect(() =>
      parseSessionSubscribeResult(
        {
          sessionId: "session-1",
          incarnation: "run-1",
          events: [{ seq: 6 }],
          asOfSeq: 6,
          durableThroughSeq: 6,
          headSeq: 5,
        },
        "session-1",
        5,
      ),
    ).toThrow("asOfSeq cannot exceed headSeq");
    expect(() =>
      parseSessionSubscribeResult(
        {
          sessionId: "session-1",
          incarnation: "run-1",
          events: [{ seq: 6 }],
          asOfSeq: 7,
          durableThroughSeq: 7,
          headSeq: 7,
        },
        "session-1",
        5,
      ),
    ).toThrow("asOfSeq must equal the final event sequence");
    expect(() =>
      parseSessionSubscribeResult(
        { sessionId: "session-1", incarnation: "run-1", events: [], asOfSeq: -1, durableThroughSeq: 0, headSeq: -1 },
        "session-1",
        -1,
      ),
    ).toThrow("durableThroughSeq must equal asOfSeq");
    expect(() =>
      parseSessionSubscribeResult(
        {
          sessionId: "session-1",
          incarnation: "run-1",
          events: [{ seq: 0 }],
          asOfSeq: 0,
          durableThroughSeq: 1,
          headSeq: 1,
        },
        "session-1",
        -1,
      ),
    ).toThrow("durableThroughSeq must equal asOfSeq");
  });

  it("requires exact nonempty cwd for every execution request", () => {
    expect(() => parseSessionStartRequest({ sessionId: "session-1" })).toThrow("cwd is required");
    expect(() =>
      parseSessionStartRequest({
        cwd: "/workspace",
        sessionId: "session-1",
        binding: {
          version: 1,
          workspaceId: "workspace-1",
          projectId: "",
          organizationId: "",
          ownerNodeId: "node-1",
          cwd: "/other",
        },
      }),
    ).toThrow("binding.cwd must equal cwd");
    expect(() =>
      parseSessionPromptRequest({ sessionId: "session-1", contentBlocks: [{ type: "text", text: "Hello" }] }),
    ).toThrow("unsupported fields");
    expect(() => parseSessionCancelRequest({ sessionId: "session-1" })).toThrow("unsupported fields");
    expect(() => parseSessionSubscribeRequest({ sessionId: "session-1", afterSeq: -1 })).toThrow("unsupported fields");
    expect(() => parseSessionSubscribeRequest({ cwd: "/workspace", sessionId: "session-1" })).toThrow(
      "unsupported fields",
    );
    expect(() => parseSessionFlushRequest({ sessionId: "session-1" })).toThrow("unsupported fields");
    expect(() =>
      parseSessionStartRequest({
        cwd: "",
        sessionId: "session-1",
        binding: {
          version: 1,
          workspaceId: "workspace-1",
          projectId: "",
          organizationId: "",
          ownerNodeId: "node-1",
          cwd: "",
        },
      }),
    ).toThrow("cwd is required");
  });

  it("rejects sequence values below the empty-session sentinel in isolation", () => {
    const baseline = {
      sessionId: "session-1",
      incarnation: "run-1",
      events: [],
      asOfSeq: -1,
      durableThroughSeq: -1,
      headSeq: -1,
    };

    expect(() => parseSessionSubscribeRequest({ cwd: "/workspace", sessionId: "session-1", afterSeq: -2 })).toThrow(
      "afterSeq must be a safe integer greater than or equal to -1",
    );
    expect(() =>
      parseSessionSubscribeRequest({ cwd: "/workspace", sessionId: "session-1", afterSeq: Number.MAX_SAFE_INTEGER }),
    ).toThrow("afterSeq must be less than Number.MAX_SAFE_INTEGER");
    expect(() => parseSessionSubscribeResult(baseline, "session-1", Number.MAX_SAFE_INTEGER)).toThrow(
      "afterSeq must be less than Number.MAX_SAFE_INTEGER",
    );
    expect(() => parseSessionSubscribeResult(baseline, "session-1", -2)).toThrow(
      "afterSeq must be a safe integer greater than or equal to -1",
    );
    expect(() => parseSessionSubscribeResult({ ...baseline, asOfSeq: -2 }, "session-1", -1)).toThrow(
      "asOfSeq must be a safe integer greater than or equal to -1",
    );
    expect(() => parseSessionSubscribeResult({ ...baseline, durableThroughSeq: -2 }, "session-1", -1)).toThrow(
      "durableThroughSeq must be a safe integer greater than or equal to -1",
    );
    expect(() => parseSessionSubscribeResult({ ...baseline, headSeq: -2 }, "session-1", -1)).toThrow(
      "headSeq must be a safe integer greater than or equal to -1",
    );
    expect(() =>
      parseTranscriptResetNotification({ sessionId: "session-1", incarnation: "run-2", headSeq: -2 }),
    ).toThrow("headSeq must be a safe integer greater than or equal to -1");
  });

  it("requires the reset notification to identify the new incarnation and cursor", () => {
    expect(parseTranscriptResetNotification({ sessionId: "session-1", incarnation: "run-2", headSeq: -1 })).toEqual({
      sessionId: "session-1",
      incarnation: "run-2",
      headSeq: -1,
    });
    expect(() => parseTranscriptResetNotification({ sessionId: "session-1", incarnation: "", headSeq: -2 })).toThrow(
      "incarnation is required",
    );
  });
});
