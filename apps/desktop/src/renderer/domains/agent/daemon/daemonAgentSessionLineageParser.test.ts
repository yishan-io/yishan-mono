import { describe, expect, it } from "vitest";

import { parseAgentSessionLineageResult } from "./daemonAgentSessionLineageParser";

describe("parseAgentSessionLineageResult", () => {
  const request = {
    runtime: "dsh" as const,
    workspaceId: "workspace-1",
    cwd: "/workspace",
    rootSessionId: "root-1",
    mode: "descendants" as const,
  };
  const lineage = {
    runtime: "dsh",
    rootSessionId: "root-1",
    mode: "descendants",
    children: [
      {
        sessionId: "child-1",
        parentSessionId: "root-1",
        origin: "subagent",
        delegationDepth: 1,
        relativeDepth: 1,
        live: true,
        persisted: true,
        activity: "running",
        mode: "continuable",
        label: "worker",
      },
    ],
  };

  it("parses exact DSH lineage for the requested root session", () => {
    expect(parseAgentSessionLineageResult(lineage, request)).toEqual(lineage);
  });

  it.each([
    ["an unknown top-level field", { ...lineage, unexpected: true }],
    ["an unknown entry field", { ...lineage, children: [{ ...lineage.children[0], unexpected: true }] }],
  ])("rejects %s", (_name, payload) => {
    expect(() => parseAgentSessionLineageResult(payload, request)).toThrow();
  });

  it.each([
    ["a response root that differs from the request", { ...lineage, rootSessionId: "root-2" }],
    ["an invalid runtime", { ...lineage, runtime: "pi" }],
    ["an invalid response mode", { ...lineage, mode: "invalid" }],
    ["an invalid child activity", { ...lineage, children: [{ ...lineage.children[0], activity: "waiting" }] }],
    ["an invalid child mode", { ...lineage, children: [{ ...lineage.children[0], mode: "invalid" }] }],
  ])("rejects %s", (_name, payload) => {
    expect(() => parseAgentSessionLineageResult(payload, request)).toThrow();
  });

  it.each([
    ["live", "true"],
    ["persisted", 1],
  ])("rejects a non-boolean %s flag", (flag, value) => {
    expect(() =>
      parseAgentSessionLineageResult({ ...lineage, children: [{ ...lineage.children[0], [flag]: value }] }, request),
    ).toThrow();
  });

  it.each([
    ["negative delegation depth", "delegationDepth", -1],
    ["fractional delegation depth", "delegationDepth", 0.5],
    ["unsafe delegation depth", "delegationDepth", Number.MAX_SAFE_INTEGER + 1],
    ["zero relative depth", "relativeDepth", 0],
    ["non-finite relative depth", "relativeDepth", Number.POSITIVE_INFINITY],
  ])("rejects %s", (_name, depthField, depth) => {
    expect(() =>
      parseAgentSessionLineageResult(
        { ...lineage, children: [{ ...lineage.children[0], [depthField]: depth }] },
        request,
      ),
    ).toThrow();
  });
});
