import { describe, expect, it } from "vitest";

import { buildNodeWorkspaceGroups, buildProjectNodeGroups } from "./shell-workspace-tree";

describe("shell-workspace-tree", () => {
  const currentNodes = [
    {
      canUse: true,
      createdAt: "2026-06-16T00:00:00.000Z",
      createdByUserId: "user-1",
      endpoint: null,
      id: "node-1",
      isOnline: true,
      kind: "external" as const,
      metadata: null,
      name: "MacBookPro",
      organizationId: "org-1",
      ownerUserId: "user-1",
      scope: "private" as const,
      updatedAt: "2026-06-16T00:00:00.000Z",
    },
    {
      canUse: true,
      createdAt: "2026-06-16T00:00:00.000Z",
      createdByUserId: "user-1",
      endpoint: null,
      id: "node-2",
      isOnline: true,
      kind: "external" as const,
      metadata: null,
      name: "MacMini",
      organizationId: "org-1",
      ownerUserId: "user-1",
      scope: "private" as const,
      updatedAt: "2026-06-16T00:00:00.000Z",
    },
  ];

  const projects = [
    {
      color: "#3b82f6",
      contextEnabled: true,
      createdAt: "2026-06-16T00:00:00.000Z",
      createdByUserId: "user-1",
      id: "project-1",
      icon: "folder",
      name: "nile",
      organizationId: "org-1",
      postScript: "",
      repoKey: "nile",
      repoProvider: "github",
      repoUrl: "https://github.com/yishan-io/nile",
      setupScript: "",
      sourceType: "repo",
      updatedAt: "2026-06-16T00:00:00.000Z",
      workspaces: [
        {
          branch: "main",
          createdAt: "2026-06-16T00:00:00.000Z",
          id: "ws-1",
          kind: "primary" as const,
          latestPullRequest: null,
          localPath: "/tmp/nile",
          nodeId: "node-1",
          organizationId: "org-1",
          projectId: "project-1",
          sourceBranch: "origin/main",
          status: "active" as const,
          updatedAt: "2026-06-16T00:00:00.000Z",
          userId: "user-1",
        },
        {
          branch: "feature/test",
          createdAt: "2026-06-16T00:00:00.000Z",
          id: "ws-2",
          kind: "worktree" as const,
          latestPullRequest: null,
          localPath: "/tmp/nile-worktree",
          nodeId: "node-2",
          organizationId: "org-1",
          projectId: "project-1",
          sourceBranch: "origin/main",
          status: "active" as const,
          updatedAt: "2026-06-16T00:00:00.000Z",
          userId: "user-1",
        },
      ],
    },
  ];

  it("projects workspaces by node while preserving node order", () => {
    const groups = buildNodeWorkspaceGroups({
      currentNodes,
      projects,
    });

    expect(groups.map((group) => group.nodeId)).toEqual(["node-1", "node-2"]);
    expect(groups[0]?.projects[0]?.workspaces.map((workspace) => workspace.id)).toEqual(["ws-1"]);
    expect(groups[1]?.projects[0]?.workspaces.map((workspace) => workspace.id)).toEqual(["ws-2"]);
  });

  it("projects workspaces by project while grouping each node once", () => {
    const groups = buildProjectNodeGroups({
      currentNodes,
      projects,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.project.id).toBe("project-1");
    expect(groups[0]?.nodes.map((node) => node.nodeId)).toEqual(["node-1", "node-2"]);
    expect(groups[0]?.nodes[0]?.workspaces.map((workspace) => workspace.id)).toEqual(["ws-1"]);
    expect(groups[0]?.nodes[1]?.workspaces.map((workspace) => workspace.id)).toEqual(["ws-2"]);
  });
});
