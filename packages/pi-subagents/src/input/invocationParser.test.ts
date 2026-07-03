import { describe, expect, it } from "vitest";

import { parseAgentInvocation } from "./invocationParser";

describe("parseAgentInvocation", () => {
  const knownAgentNames = ["Explore", "Reviewer", "Planner"];

  it("returns null when the prompt does not start with @agent", () => {
    expect(parseAgentInvocation("review @src/auth.ts", knownAgentNames)).toBeNull();
  });

  it("parses a single leading agent token on the same line as the task", () => {
    expect(parseAgentInvocation("@agent:Reviewer review @src/auth.ts", knownAgentNames)).toEqual({
      kind: "invocation",
      invocation: {
        agents: ["Reviewer"],
        prompt: "review @src/auth.ts",
        mode: "foreground",
      },
    });
  });

  it("parses multiple leading agent tokens with a shared task", () => {
    expect(
      parseAgentInvocation("@agent:Explore\n@agent:Reviewer\n\nInvestigate the authentication flow.", knownAgentNames),
    ).toEqual({
      kind: "invocation",
      invocation: {
        agents: ["Explore", "Reviewer"],
        prompt: "Investigate the authentication flow.",
        mode: "foreground",
      },
    });
  });

  it("matches agent names case-insensitively", () => {
    expect(parseAgentInvocation("@agent:planner draft the plan", knownAgentNames)).toEqual({
      kind: "invocation",
      invocation: {
        agents: ["Planner"],
        prompt: "draft the plan",
        mode: "foreground",
      },
    });
  });

  it("returns an error when a leading agent token is unknown", () => {
    expect(parseAgentInvocation("@agent:Ghost inspect auth", knownAgentNames)).toEqual({
      kind: "error",
      message: "Unknown agent: Ghost",
    });
  });

  it("returns an error when the task is empty", () => {
    expect(parseAgentInvocation("@agent:Explore\n\n", knownAgentNames)).toEqual({
      kind: "error",
      message: "Direct @agent invocation requires a non-empty task",
    });
  });
});
