import { describe, expect, it } from "vitest";

import {
  hasRelayWorkspaceQueryContext,
  isRelayWorkspaceQueryEnabled,
} from "@/features/workspaces/queries/workspace-query-runtime";

describe("workspace-query-runtime", () => {
  it("requires nodeId for relay workspace context", () => {
    expect(
      hasRelayWorkspaceQueryContext({
        nodeId: null,
        organizationId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      }),
    ).toBe(false);

    expect(
      hasRelayWorkspaceQueryContext({
        nodeId: "node-1",
        organizationId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      }),
    ).toBe(true);
  });

  it("disables relay queries when nodeId is missing", () => {
    expect(
      isRelayWorkspaceQueryEnabled({
        accessToken: "access-token",
        enabled: true,
        nodeId: "",
        organizationId: "org-1",
        projectId: "project-1",
        status: "authenticated",
        workspaceId: "workspace-1",
      }),
    ).toBe(false);
  });
});
