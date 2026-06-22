import { describe, expect, it } from "vitest";

import {
  hasWorkspaceQueryContext,
  hasWorkspaceQueryPath,
  isWorkspaceQueryEnabled,
  requireWorkspaceQueryAccessToken,
} from "./workspace-query-runtime";

describe("workspace-query-runtime", () => {
  it("accepts project-level and workspace-level query contexts", () => {
    expect(hasWorkspaceQueryContext({ organizationId: "org-1", projectId: "project-1" })).toBe(true);
    expect(hasWorkspaceQueryContext({ organizationId: "org-1", projectId: "project-1", workspaceId: "ws-1" })).toBe(
      true,
    );
    expect(hasWorkspaceQueryContext({ organizationId: "", projectId: "project-1", workspaceId: "ws-1" })).toBe(false);
    expect(hasWorkspaceQueryContext({ organizationId: "org-1", projectId: "project-1", workspaceId: "" })).toBe(false);
  });

  it("treats only non-empty trimmed paths as valid file/diff targets", () => {
    expect(hasWorkspaceQueryPath("README.md")).toBe(true);
    expect(hasWorkspaceQueryPath("   ")).toBe(false);
  });

  it("shares one enabled gate across workspace queries", () => {
    expect(
      isWorkspaceQueryEnabled({
        accessToken: "token",
        enabled: true,
        organizationId: "org-1",
        projectId: "project-1",
        status: "authenticated",
      }),
    ).toBe(true);

    expect(
      isWorkspaceQueryEnabled({
        accessToken: null,
        enabled: true,
        organizationId: "org-1",
        projectId: "project-1",
        status: "authenticated",
      }),
    ).toBe(false);
  });

  it("throws a consistent missing-token error when a query function runs without auth", () => {
    expect(() => requireWorkspaceQueryAccessToken(undefined)).toThrow("Missing access token");
    expect(requireWorkspaceQueryAccessToken("token")).toBe("token");
  });
});
