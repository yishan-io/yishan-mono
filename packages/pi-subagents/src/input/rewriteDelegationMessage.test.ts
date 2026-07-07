import { describe, expect, it } from "vitest";

import { rewriteDelegationMessage } from "./rewriteDelegationMessage";

describe("rewriteDelegationMessage", () => {
  it("rewrites string user messages into delegation prompts", () => {
    expect(
      rewriteDelegationMessage(
        {
          role: "user",
          content: "@agent:Explore inspect auth",
          timestamp: 1,
        },
        ["Explore"],
      ),
    ).toEqual({
      role: "user",
      content:
        "Use the Agent tool to delegate the task below to the named sub-agent. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. Once delegated, do not duplicate the same work yourself. Wait for the result or continue only with non-overlapping tasks. In the Agent prompt, specify whether the sub-agent should do research or make code changes, point it to the most relevant files or directories, and tell it what result to return. Wait for the sub-agent result, continue the work yourself, and then give the final response to the user.\n\nSub-agent: Explore\n\nTask:\ninspect auth",
      timestamp: 1,
    });
  });

  it("rewrites text-plus-image user messages while preserving images", () => {
    expect(
      rewriteDelegationMessage(
        {
          role: "user",
          content: [
            { type: "text", text: "@agent:Explore inspect auth" },
            { type: "image", data: "abc", mimeType: "image/png" },
          ],
          timestamp: 1,
        },
        ["Explore"],
      ),
    ).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "Use the Agent tool to delegate the task below to the named sub-agent. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. Once delegated, do not duplicate the same work yourself. Wait for the result or continue only with non-overlapping tasks. In the Agent prompt, specify whether the sub-agent should do research or make code changes, point it to the most relevant files or directories, and tell it what result to return. Wait for the sub-agent result, continue the work yourself, and then give the final response to the user.\n\nSub-agent: Explore\n\nTask:\ninspect auth",
        },
        { type: "image", data: "abc", mimeType: "image/png" },
      ],
      timestamp: 1,
    });
  });

  it("leaves unrelated user messages unchanged", () => {
    const message = {
      role: "user" as const,
      content: "hello",
      timestamp: 1,
    };

    expect(rewriteDelegationMessage(message, ["Explore"])).toBe(message);
  });
});
