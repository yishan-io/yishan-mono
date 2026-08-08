import { describe, expect, it, vi } from "vitest";
import { DaemonProjectClient } from "./daemonProjectClient";

describe("DaemonProjectClient", () => {
  it("carries workspace lifecycle state and health through listWithWorkspaces", async () => {
    const invoke = vi.fn(async () => [
      {
        id: "project-1",
        name: "Project 1",
        organizationId: "org-1",
        sourceType: "git",
        repoProvider: null,
        repoUrl: null,
        repoKey: "project-1",
        icon: "folder",
        color: "#1E66F5",
        setupScript: "",
        postScript: "",
        commands: "[]",
        contextEnabled: true,
        createdByUserId: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        workspaces: [
          {
            id: "workspace-1",
            organizationId: "org-1",
            projectId: "project-1",
            nodeId: "node-1",
            kind: "worktree",
            status: "active",
            state: "error",
            health: "path-missing",
            branch: "feature/broken",
            sourceBranch: "main",
            localPath: "/tmp/broken",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "workspace-2",
            organizationId: "org-1",
            projectId: "project-1",
            nodeId: "node-1",
            kind: "worktree",
            status: "active",
            state: "active",
            branch: "feature/ok",
            sourceBranch: "main",
            localPath: "/tmp/ok",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ]);

    const client = new DaemonProjectClient(invoke);
    const projects = await client.listByOrg("org-1", { withWorkspaces: true });

    expect(invoke).toHaveBeenCalledWith("project.listWithWorkspaces", { organizationId: "org-1" });
    const broken = projects[0]?.workspaces.find((workspace) => workspace.id === "workspace-1");
    expect(broken?.state).toBe("error");
    expect(broken?.health).toBe("path-missing");
    const healthy = projects[0]?.workspaces.find((workspace) => workspace.id === "workspace-2");
    expect(healthy?.state).toBe("active");
    expect(healthy?.health).toBeUndefined();
  });

  it("ignores unknown workspace state and health values", async () => {
    const invoke = vi.fn(async () => [
      {
        id: "project-1",
        name: "Project 1",
        organizationId: "org-1",
        sourceType: "git",
        repoProvider: null,
        repoUrl: null,
        repoKey: "project-1",
        icon: "folder",
        color: "#1E66F5",
        setupScript: "",
        postScript: "",
        commands: "[]",
        contextEnabled: true,
        createdByUserId: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        workspaces: [
          {
            id: "workspace-1",
            organizationId: "org-1",
            projectId: "project-1",
            nodeId: "node-1",
            kind: "worktree",
            status: "active",
            state: "degraded",
            health: "not-a-health",
            branch: "feature/broken",
            sourceBranch: "main",
            localPath: "/tmp/broken",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ]);

    const client = new DaemonProjectClient(invoke);
    const projects = await client.listByOrg("org-1");
    const workspace = projects[0]?.workspaces[0];
    expect(workspace?.state).toBeUndefined();
    expect(workspace?.health).toBeUndefined();
  });

  it("forwards nodeId, localPath, and contextEnabled on project.create", async () => {
    const invoke = vi.fn(async () => ({
      id: "project-1",
      name: "Plain Folder",
      sourceType: "unknown",
      contextEnabled: true,
      workspaces: [],
    }));

    const client = new DaemonProjectClient(invoke);
    await client.create("org-1", {
      name: "Plain Folder",
      sourceTypeHint: "unknown",
      nodeId: "node-1",
      localPath: "/tmp/plain-folder",
      contextEnabled: true,
    });

    expect(invoke).toHaveBeenCalledWith("project.create", {
      name: "Plain Folder",
      organizationId: "org-1",
      sourceType: "unknown",
      repoUrl: undefined,
      nodeId: "node-1",
      localPath: "/tmp/plain-folder",
      contextEnabled: true,
    });
  });
});
