import { describe, expect, it } from "vitest";

import { parseAgentCancelSubagentResult } from "./daemonAgentCancelSubagentParser";

const request = {
  runtime: "dsh" as const,
  workspaceId: "workspace-1",
  cwd: "/workspace",
  parentSessionId: "parent-1",
  childSessionId: "child-1",
};

const receipt = {
  runtime: "dsh",
  parentSessionId: "parent-1",
  childSessionId: "child-1",
  interruptRequested: true,
};

describe("parseAgentCancelSubagentResult", () => {
  it("parses the exact DSH cancellation receipt", () => {
    expect(parseAgentCancelSubagentResult(receipt, request)).toEqual(receipt);
  });

  it.each([
    ["an unknown field", { ...receipt, unexpected: true }],
    ["a mismatched parent", { ...receipt, parentSessionId: "parent-2" }],
    ["a mismatched child", { ...receipt, childSessionId: "child-2" }],
    ["an invalid runtime", { ...receipt, runtime: "pi" }],
    ["a non-boolean receipt", { ...receipt, interruptRequested: "true" }],
  ])("rejects %s", (_name, payload) => {
    expect(() => parseAgentCancelSubagentResult(payload, request)).toThrow();
  });
});
