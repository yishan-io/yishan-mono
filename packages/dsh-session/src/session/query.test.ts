import { describe, expect, expectTypeOf, it } from "vitest";

import type { SessionLineageResult, SessionListResult, SessionReadResult, SessionResumeRequest } from "./query";

describe("session wire DTOs", () => {
  it("preserves the Yishan session request and response wire shapes", () => {
    const resumeRequest: SessionResumeRequest = {
      cwd: "/workspace",
      sessionId: "session-1",
      workspaceId: "workspace-1",
    };
    const listResult: SessionListResult = { sessions: [] };
    const lineageResult: SessionLineageResult = {
      rootSessionId: "session-1",
      mode: "children",
      children: [],
    };

    expect(resumeRequest).toEqual({ cwd: "/workspace", sessionId: "session-1", workspaceId: "workspace-1" });
    expect(listResult.sessions).toEqual([]);
    expect(lineageResult).toMatchObject({ mode: "children", rootSessionId: "session-1" });
    expectTypeOf<SessionReadResult["filePath"]>().toEqualTypeOf<string>();
  });
});
