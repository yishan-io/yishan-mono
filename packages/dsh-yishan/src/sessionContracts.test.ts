import { describe, expect, it } from "vitest";

import {
  parseSessionLineageRequest,
  parseSessionListRequest,
  parseSessionReadRequest,
  parseSessionResumeRequest,
} from "./sessionContracts";

describe("Yishan session contracts", () => {
  it("requires exactly the current workspace cwd to list sessions", () => {
    expect(parseSessionListRequest({ cwd: "/workspace" })).toEqual({ cwd: "/workspace" });
    expect(() => parseSessionListRequest({ cwd: "/workspace", page: 1 })).toThrow(
      "session list request has unsupported fields",
    );
  });

  it("requires exactly cwd and sessionId to read or resume a session", () => {
    const request = { cwd: "/workspace", sessionId: "session-1" };
    expect(parseSessionReadRequest(request)).toEqual(request);
    expect(parseSessionResumeRequest(request)).toEqual(request);
    expect(() => parseSessionReadRequest({ ...request, extra: true })).toThrow(
      "session read request has unsupported fields",
    );
    expect(() => parseSessionResumeRequest({ cwd: "/workspace" })).toThrow(
      "session resume request has unsupported fields",
    );
  });
});

describe("parseSessionLineageRequest", () => {
  it("requires the exact lineage request with a supported mode", () => {
    expect(parseSessionLineageRequest({ cwd: "/workspace", rootSessionId: "root", mode: "children" })).toEqual({
      cwd: "/workspace",
      rootSessionId: "root",
      mode: "children",
    });
    expect(() => parseSessionLineageRequest({ cwd: "/workspace", rootSessionId: "root", mode: "all" })).toThrow(
      "mode must be children or descendants",
    );
    expect(() => parseSessionLineageRequest({ cwd: "/workspace", rootSessionId: "", mode: "descendants" })).toThrow(
      "rootSessionId is required",
    );
  });
});
