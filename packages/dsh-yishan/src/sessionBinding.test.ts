import { describe, expect, it } from "vitest";

import { parseSessionBinding } from "./sessionBinding";

describe("parseSessionBinding", () => {
  it("accepts the daemon-owned DSH session binding", () => {
    expect(
      parseSessionBinding({
        sessionId: "session-1",
        workspaceId: "workspace-1",
        workspaceGeneration: 3,
        cwd: "/worktree",
      }),
    ).toEqual({ sessionId: "session-1", workspaceId: "workspace-1", workspaceGeneration: 3, cwd: "/worktree" });
  });

  it("rejects an invalid workspace generation", () => {
    expect(() => parseSessionBinding({ sessionId: "s", workspaceId: "w", workspaceGeneration: 0, cwd: "/w" })).toThrow(
      "workspaceGeneration must be a positive safe integer",
    );
  });
});
