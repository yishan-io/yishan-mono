import { describe, expect, it } from "vitest";

import { parseDurableCursor } from "./durableCursor";

describe("parseDurableCursor", () => {
  it("accepts a durable sequence and runtime incarnation", () => {
    expect(parseDurableCursor({ sessionId: "session-1", durableThroughSeq: 9, incarnation: "runtime-2" })).toEqual({
      sessionId: "session-1",
      durableThroughSeq: 9,
      incarnation: "runtime-2",
    });
  });

  it("accepts the initial zero watermark", () => {
    expect(
      parseDurableCursor({ sessionId: "session-1", durableThroughSeq: 0, incarnation: "runtime-1" }),
    ).toMatchObject({
      durableThroughSeq: 0,
    });
  });

  it("accepts -1 as the empty-session durable watermark", () => {
    expect(
      parseDurableCursor({ sessionId: "session-1", durableThroughSeq: -1, incarnation: "runtime-1" }),
    ).toMatchObject({ durableThroughSeq: -1 });
  });

  it("rejects watermarks below the empty-session sentinel", () => {
    expect(() =>
      parseDurableCursor({ sessionId: "session-1", durableThroughSeq: -2, incarnation: "runtime-1" }),
    ).toThrow("durableThroughSeq must be a safe integer greater than or equal to -1");
  });
});
