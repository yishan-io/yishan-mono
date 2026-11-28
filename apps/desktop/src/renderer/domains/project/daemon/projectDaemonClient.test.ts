import { describe, expect, it, vi } from "vitest";
import { DaemonProjectClient, parseProjectListPreference } from "./projectDaemonClient";

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
        taskPrefix: "PROJ",
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
    expect(projects[0]?.taskPrefix).toBe("PROJ");
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

  it("loads and normalizes persisted list preferences", async () => {
    const invoke = vi.fn(async () => ({
      found: true,
      value: {
        version: 1,
        by_project: {
          projectOrderIds: ["project-2", "project-1"],
          foldedProjectIds: ["project-2"],
        },
        workspaceOrderByParentId: { "project-1:node-a": ["workspace-1"] },
      },
    }));

    const client = new DaemonProjectClient(invoke);
    const preferences = await client.getListPreferences("org-1");

    expect(invoke).toHaveBeenCalledWith("preferences.get", { scope: "org-1", key: "project.navigator" });
    expect(preferences.by_project.projectOrderIds).toEqual(["project-2", "project-1"]);
    expect(preferences.by_project.foldedProjectIds).toEqual(["project-2"]);
    expect(preferences.workspaceOrderByParentId["project-1:node-a"]).toEqual(["workspace-1"]);
  });

  it("normalizes malformed list preference payloads to safe defaults", async () => {
    const invoke = vi.fn(async () => ({
      found: true,
      value: {
        version: "latest",
        by_project: { projectOrderIds: "not-an-array", foldedProjectIds: [1, 2] },
      },
    }));

    const client = new DaemonProjectClient(invoke);
    const preferences = await client.getListPreferences("org-1");

    expect(preferences.version).toBe(1);
    expect(preferences.by_project.projectOrderIds).toEqual([]);
    expect(preferences.by_project.foldedProjectIds).toEqual([]);
    expect(preferences.workspaceOrderByParentId).toEqual({});
  });

  it("persists list preferences with the org id", async () => {
    const invoke = vi.fn(async (_method: string, params?: unknown) => ({
      found: true,
      value: (params as { value: unknown }).value,
    }));
    const client = new DaemonProjectClient(invoke);

    const result = await client.setListPreferences("org-1", {
      version: 1,
      by_project: {
        projectOrderIds: ["project-1"],
        foldedProjectIds: [],
      },
      workspaceOrderByParentId: { "project-1:node-a": ["workspace-1"] },
    });

    expect(invoke).toHaveBeenCalledWith("preferences.set", {
      scope: "org-1",
      key: "project.navigator",
      value: {
        version: 1,
        by_project: {
          projectOrderIds: ["project-1"],
          foldedProjectIds: [],
        },
        workspaceOrderByParentId: { "project-1:node-a": ["workspace-1"] },
      },
    });
    expect(result.by_project.projectOrderIds).toEqual(["project-1"]);
  });
  it("reads legacy workspace buckets from by_project, unless a shared bucket exists", () => {
    const legacy = {
      version: 0,
      by_project: { workspaceOrderByParentId: { shared: ["project"], project: ["p"] } },
    };
    expect(parseProjectListPreference(legacy).workspaceOrderByParentId).toEqual({
      shared: ["project"],
      project: ["p"],
    });
    expect(parseProjectListPreference({ ...legacy, workspaceOrderByParentId: {} }).workspaceOrderByParentId).toEqual(
      {},
    );
    expect(parseProjectListPreference({ ...legacy, version: 2 }).workspaceOrderByParentId).toEqual({});
  });
  it("does not hydrate future versions into a writable default snapshot", async () => {
    const client = new DaemonProjectClient(vi.fn().mockResolvedValue({ found: true, value: { version: 2 } }));
    await expect(client.getListPreferences("org")).rejects.toThrow("Unsupported");
  });
});
