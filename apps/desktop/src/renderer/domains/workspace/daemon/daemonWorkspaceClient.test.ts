// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { DaemonWorkspaceClient } from "./daemonWorkspaceClient";

describe("DaemonWorkspaceClient", () => {
  it("reuses listed workspace ids when worktree paths only differ by slashes", async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === "list") {
        return [{ id: "workspace-1", path: "/tmp/repo" }];
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    const workspaceId = await client.ensureIdByWorktreePath("/tmp/repo/");

    expect(workspaceId).toBe("workspace-1");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("list");
  });

  it("refreshes pull request state through the dedicated workspace RPC", async () => {
    const invoke = vi.fn(async (method: string, params?: unknown) => {
      if (method === "workspace.refreshPullRequest") {
        expect(params).toEqual({
          workspaceId: "workspace-1",
        });
        return {
          id: "workspace-1",
          path: "/tmp/repo/",
          pullRequest: {
            number: 42,
            title: "Refresh me",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const workspaceIdByWorktreePath = new Map<string, string>();
    const client = new DaemonWorkspaceClient(invoke, workspaceIdByWorktreePath);

    const workspace = await client.refreshPullRequest({
      workspaceId: "workspace-1",
    });

    expect(workspace.pullRequest).toEqual({ number: 42, title: "Refresh me" });
    expect(workspaceIdByWorktreePath.get("/tmp/repo")).toBe("workspace-1");
  });

  it("throws when preferred workspace id is not found in the daemon list", async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === "list") {
        return [{ id: "workspace-stale", path: "/tmp/repo" }];
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    await expect(client.ensureIdByWorktreePath("/tmp/repo", "workspace-1")).rejects.toThrow(
      "daemon workspace not found for id: workspace-1",
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("list");
  });

  it("creates a local folder and maps localPath to path", async () => {
    const invoke = vi.fn(async (method: string, params?: unknown) => {
      if (method === "workspace.importLocalPath") {
        expect(params).toEqual({ path: "/tmp/repo", name: "My Folder" });
        return {
          kind: "folder",
          folder: {
            id: "folder-1",
            localPath: "/tmp/repo",
            state: "ready",
            health: "healthy",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    const folder = await client.importLocalPath({ path: "/tmp/repo", name: "My Folder" });

    expect(folder).toEqual({
      kind: "folder",
      folder: {
        id: "folder-1",
        path: "/tmp/repo",
        state: "ready",
        health: "healthy",
      },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("workspace.importLocalPath", {
      path: "/tmp/repo",
      name: "My Folder",
    });
  });

  it("returns git metadata without a local folder", async () => {
    const invoke = vi.fn(async () => ({
      kind: "git",
      remoteUrl: "https://github.com/yishan-io/project.git",
      currentBranch: "main",
    }));
    const client = new DaemonWorkspaceClient(invoke, new Map());

    await expect(client.importLocalPath({ path: "/tmp/repo" })).resolves.toEqual({
      kind: "git",
      remoteUrl: "https://github.com/yishan-io/project.git",
      currentBranch: "main",
    });
  });

  it("surfaces importLocalPath invoke errors", async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === "workspace.importLocalPath") {
        throw new Error("daemon refused to create");
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    await expect(client.importLocalPath({ path: "/tmp/repo" })).rejects.toThrow("daemon refused to create");
  });

  it("creates a local folder rejects when path is missing", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    await expect(client.importLocalPath({ path: "  " })).rejects.toThrow("path is required");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("creates a local folder rejects for an invalid response record", async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === "workspace.importLocalPath") {
        return { localPath: "/tmp/repo" };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    await expect(client.importLocalPath({ path: "/tmp/repo" })).rejects.toThrow(
      "importLocalPath returned invalid response",
    );
  });

  it("lists local folders and returns an empty array for a non-array response", async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === "workspace.listLocalFolders") {
        return { not: "an array" };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    await expect(client.listLocalFolders()).resolves.toEqual([]);
  });

  it("lists local folders, parsing valid records and skipping malformed ones", async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === "workspace.listLocalFolders") {
        return [
          { id: "folder-1", localPath: "/tmp/a" },
          { id: "folder-2", localPath: "/tmp/b", name: "B" },
          { id: "folder-3" },
          { localPath: "/tmp/c" },
          "garbage",
        ];
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    const folders = await client.listLocalFolders();

    expect(folders).toEqual([
      { id: "folder-1", path: "/tmp/a" },
      { id: "folder-2", path: "/tmp/b", name: "B" },
    ]);
  });

  it("deletes a local folder by id", async () => {
    const invoke = vi.fn(async (method: string, params?: unknown) => {
      if (method === "workspace.deleteLocalFolder") {
        expect(params).toEqual({ id: "folder-1" });
        return { ok: true };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    await client.deleteLocalFolder({ id: "  folder-1  " });

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("deletes a local folder rejects for an empty id", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    await expect(client.deleteLocalFolder({ id: "  " })).rejects.toThrow("id is required");
    expect(invoke).not.toHaveBeenCalled();
  });
});
