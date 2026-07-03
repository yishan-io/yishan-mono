import { describe, expect, it } from "vitest";

import { buildDelegationPrompt } from "./delegationPrompt";

describe("buildDelegationPrompt", () => {
  it("builds a single-agent delegation prompt", () => {
    expect(
      buildDelegationPrompt({
        agents: ["Explore"],
        prompt: "Inspect authentication",
        mode: "foreground",
      }),
    ).toBe(`Use the Agent tool to delegate the task below to the named sub-agent. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. Wait for the sub-agent result, continue the work yourself, and then give the final response to the user.

Sub-agent: Explore

Task:
Inspect authentication`);
  });

  it("builds a multi-agent delegation prompt", () => {
    expect(
      buildDelegationPrompt({
        agents: ["Explore", "Reviewer"],
        prompt: "Inspect authentication",
        mode: "foreground",
      }),
    ).toBe(`Use the Agent tool to delegate the task below to the listed sub-agents. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. Run them in parallel when helpful, wait for their results, continue the work yourself, and then give the final response to the user.

Sub-agents:
- Explore
- Reviewer

Task:
Inspect authentication`);
  });
});
