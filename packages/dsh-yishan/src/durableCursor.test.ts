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

  it("rejects negative watermarks", () => {
    expect(() =>
      parseDurableCursor({ sessionId: "session-1", durableThroughSeq: -1, incarnation: "runtime-1" }),
    ).toThrow("durableThroughSeq must be a non-negative safe integer");
  });
});
