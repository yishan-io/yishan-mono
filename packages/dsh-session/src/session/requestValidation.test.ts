import { describe, expect, it } from "vitest";

import {
  parseSessionLineageRequest,
  parseSessionPromptRequest,
  parseSessionSubscribeRequest,
} from "./requestValidation";

describe("session request validation", () => {
  it("parses valid requests and ignores additive fields", () => {
    expect(
      parseSessionSubscribeRequest({ cwd: "/workspace", sessionId: "session-1", afterSeq: -1, futureField: true }),
    ).toEqual({ cwd: "/workspace", sessionId: "session-1", afterSeq: -1 });
  });

  it("rejects invalid sequence and lineage values", () => {
    expect(() => parseSessionSubscribeRequest({ cwd: "/workspace", sessionId: "session-1", afterSeq: -2 })).toThrow();
    expect(() =>
      parseSessionLineageRequest({ cwd: "/workspace", rootSessionId: "session-1", mode: "ancestors" }),
    ).toThrow();
  });

  it("requires at least one text prompt block", () => {
    expect(() => parseSessionPromptRequest({ cwd: "/workspace", sessionId: "session-1", contentBlocks: [] })).toThrow();
    expect(() =>
      parseSessionPromptRequest({
        cwd: "/workspace",
        sessionId: "session-1",
        contentBlocks: [{ type: "image", url: "image.png" }],
      }),
    ).toThrow();
  });
});
