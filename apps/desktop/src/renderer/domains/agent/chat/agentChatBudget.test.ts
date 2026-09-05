import { describe, expect, it } from "vitest";

import { countMessageUtf8Bytes } from "./agentChatBudget";

describe("countMessageUtf8Bytes", () => {
  it("counts all supported content blocks and display metadata in UTF-8 bytes", () => {
    const message = {
      id: "message-1",
      role: "assistant" as const,
      content: [
        { type: "text" as const, text: "text 🚀" },
        {
          type: "thinking" as const,
          thinking: "thinking",
          thinkingSignature: { summary: [{ type: "summary", text: "summary" }] },
        },
        { type: "toolCall" as const, id: "call-1", name: "read", arguments: { path: "README.md" } },
      ],
      errorMessage: "error",
      stopReason: "stop",
      customType: "custom",
      toolName: "read",
      toolCallId: "call-1",
      details: { source: "test" },
    };
    const expectedValues = [
      "text 🚀",
      "thinking",
      "summary",
      JSON.stringify({ path: "README.md" }),
      "error",
      "stop",
      "custom",
      "read",
      "call-1",
      JSON.stringify({ source: "test" }),
    ];

    expect(countMessageUtf8Bytes(message)).toBe(new TextEncoder().encode(expectedValues.join("")).length);
  });

  it("counts a string thinking signature", () => {
    const message = {
      id: "message-1",
      role: "assistant" as const,
      content: [{ type: "thinking" as const, thinking: "thought", thinkingSignature: "signature" }],
    };

    expect(countMessageUtf8Bytes(message)).toBe(new TextEncoder().encode("thoughtsignature").length);
  });
});
