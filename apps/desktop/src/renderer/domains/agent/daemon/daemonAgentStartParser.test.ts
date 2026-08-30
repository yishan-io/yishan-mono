import { describe, expect, it } from "vitest";
import { parseAgentStartResult } from "./daemonAgentStartParser";
import type { AgentStartRequest } from "./daemonAgentTypes";

const request: AgentStartRequest = {
  runtime: "dsh",
  sessionId: "session",
  tabId: "tab",
  workspaceId: "workspace",
  cwd: "/workspace",
};

describe("parseAgentStartResult", () => {
  it("parses a DSH start snapshot", () => {
    const result = parseAgentStartResult(
      {
        runtime: "dsh",
        sessionId: "session",
        dshAttachSnapshot: {
          runtime: "dsh",
          sessionId: "session",
          instanceId: "instance",
          events: [],
          asOfSeq: -1,
          durableThroughSeq: -1,
          headSeq: -1,
        },
      },
      request,
    );

    expect(result.runtime).toBe("dsh");
    if (result.runtime !== "dsh") throw new TypeError("expected DSH result");
    expect(result.dshAttachSnapshot.instanceId).toBe("instance");
  });

  it("rejects a DSH v3 response with no snapshot", () => {
    expect(() => parseAgentStartResult({ runtime: "dsh", sessionId: "session" }, request)).toThrow(
      "DSH start result is missing its transcript snapshot",
    );
  });

  it("rejects a present malformed DSH snapshot", () => {
    expect(() =>
      parseAgentStartResult({ runtime: "dsh", sessionId: "session", dshAttachSnapshot: null }, request),
    ).toThrow("DSH attach result must be an object");
  });

  it("rejects a mismatched session identity", () => {
    expect(() =>
      parseAgentStartResult(
        {
          runtime: "dsh",
          sessionId: "other",
          dshAttachSnapshot: {
            runtime: "dsh",
            sessionId: "other",
            instanceId: "instance",
            events: [],
            asOfSeq: -1,
            durableThroughSeq: -1,
            headSeq: -1,
          },
        },
        request,
      ),
    ).toThrow("agent start result identity does not match request");
  });
});
