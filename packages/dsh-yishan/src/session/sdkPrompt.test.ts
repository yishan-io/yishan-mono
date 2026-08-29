import { describe, expect, it } from "vitest";

import { parseStockSessionPromptRequest } from "./protocol";

describe("SDK session prompt parsing", () => {
  it("accepts only the text-only SDK prompt shape", () => {
    expect(
      parseStockSessionPromptRequest({ sessionId: "session-1", contentBlocks: [{ type: "text", text: "Hello" }] }),
    ).toEqual({
      sessionId: "session-1",
      contentBlocks: [{ type: "text", text: "Hello" }],
    });
    expect(() =>
      parseStockSessionPromptRequest({ sessionId: "session-1", contentBlocks: [{ type: "image", text: "" }] }),
    ).toThrow("contentBlocks must contain text blocks");
    expect(() => parseStockSessionPromptRequest({ sessionId: "session-1", contentBlocks: [], extra: true })).toThrow(
      "stock session prompt request has unsupported fields",
    );
  });
});
