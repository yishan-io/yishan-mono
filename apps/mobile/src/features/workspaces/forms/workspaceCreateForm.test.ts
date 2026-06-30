import { describe, expect, it } from "vitest";

import type { Node } from "@/features/nodes/nodes.types";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import { resolveWorkspaceCreateNodeOptions } from "./workspaceCreateForm";

const currentNodes: Node[] = [
  {
    canUse: true,
    createdAt: "2026-06-17T00:00:00.000Z",
    createdByUserId: "user-1",
    endpoint: null,
    id: "node-1",
    isOnline: true,
    kind: "managed",
    metadata: null,
    name: "MacBook Pro",
    organizationId: "org-1",
    ownerUserId: "user-1",
    scope: "private",
    updatedAt: "2026-06-17T00:00:00.000Z",
  },
];

const primaryWorkspace = {
  branch: "main",
  createdAt: "2026-06-17T00:00:00.000Z",
  id: "workspace-1",
  kind: "primary" as const,
  latestPullRequest: null,
  localPath: "/tmp/yishan",
  nodeId: "node-1",
  organizationId: "org-1",
  projectId: "project-1",
  sourceBranch: null,
  status: "active" as const,
  updatedAt: "2026-06-17T00:00:00.000Z",
  userId: "user-1",
};

const project: ProjectWithWorkspaces = {
  color: "#00aa77",
  contextEnabled: true,
  createdAt: "2026-06-17T00:00:00.000Z",
  createdByUserId: "user-1",
  icon: "terminal",
  id: "project-1",
  name: "Yishan",
  organizationId: "org-1",
  postScript: "",
  repoKey: "org/yishan",
  repoProvider: "github",
  repoUrl: "https://github.com/org/yishan",
  setupScript: "",
  sourceType: "git",
  updatedAt: "2026-06-17T00:00:00.000Z",
  workspaces: [primaryWorkspace],
};

describe("workspaceCreateForm", () => {
  it("includes the primary workspace id in node options", () => {
    expect(resolveWorkspaceCreateNodeOptions({ currentNodes, project })).toEqual([
      {
        localPath: "/tmp/yishan",
        nodeId: "node-1",
        nodeKind: "managed",
        nodeName: "MacBook Pro",
        nodeScope: "private",
        sourceBranch: "origin/main",
        workspaceId: "workspace-1",
      },
    ]);
  });

  it("does not invent origin/main when the primary workspace has no branch data", () => {
    expect(
      resolveWorkspaceCreateNodeOptions({
        currentNodes,
        project: {
          ...project,
          workspaces: [
            {
              ...primaryWorkspace,
              branch: null,
              sourceBranch: null,
            },
          ],
        },
      }),
    ).toEqual([
      {
        localPath: "/tmp/yishan",
        nodeId: "node-1",
        nodeKind: "managed",
        nodeName: "MacBook Pro",
        nodeScope: "private",
        sourceBranch: "",
        workspaceId: "workspace-1",
      },
    ]);
  });
});
