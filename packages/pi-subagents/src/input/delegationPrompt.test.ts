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
    ).toBe(`Use the Agent tool to delegate the task below to the named sub-agent. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. Once delegated, do not duplicate the same work yourself. Wait for the result or continue only with non-overlapping tasks. In the Agent prompt, specify whether the sub-agent should do research or make code changes, point it to the most relevant files or directories, and tell it what result to return. Wait for the sub-agent result, continue the work yourself, and then give the final response to the user.

Sub-agent: Explore

Task:
Inspect authentication`);
  });

  it("builds a multi-agent delegation prompt", () => {
    expect(
      buildDelegationPrompt({
        agents: ["Explore", "General"],
        prompt: "Inspect authentication",
        mode: "foreground",
      }),
    ).toBe(`Use the Agent tool to delegate the task below to the listed sub-agents. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. If the workstreams are independent, run separate Agent calls in parallel. Once delegated, do not duplicate the same work yourself. Wait for the result or continue only with non-overlapping tasks. In the Agent prompt, specify whether the sub-agent should do research or make code changes, point it to the most relevant files or directories, and tell it what result to return. Wait for the sub-agent results, continue the work yourself, and then give the final response to the user.

Sub-agents:
- Explore
- General

Task:
Inspect authentication`);
  });
});
