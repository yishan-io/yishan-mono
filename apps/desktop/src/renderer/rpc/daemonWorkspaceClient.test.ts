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

  it("caches daemon-opened workspace paths without trailing slashes", async () => {
    const invoke = vi.fn(async (method: string, params?: unknown) => {
      if (method === "open") {
        return {
          id: "workspace-1",
          path: "/tmp/repo/",
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const workspaceIdByWorktreePath = new Map<string, string>();
    const client = new DaemonWorkspaceClient(invoke, workspaceIdByWorktreePath);

    const workspace = await client.open({
      workspaceId: "workspace-1",
      workspaceWorktreePath: "/tmp/repo/",
    });

    expect(workspace.path).toBe("/tmp/repo");
    expect(workspaceIdByWorktreePath.get("/tmp/repo")).toBe("workspace-1");
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

  it("reopens a path with the preferred workspace id when the daemon only knows a stale id", async () => {
    const invoke = vi.fn(async (method: string, params?: unknown) => {
      if (method === "list") {
        return [{ id: "workspace-stale", path: "/tmp/repo" }];
      }
      if (method === "open") {
        expect(params).toEqual({
          id: "workspace-1",
          path: "/tmp/repo",
        });
        return {
          id: "workspace-1",
          path: "/tmp/repo",
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const client = new DaemonWorkspaceClient(invoke, new Map());

    const workspaceId = await client.ensureIdByWorktreePath("/tmp/repo", "workspace-1");

    expect(workspaceId).toBe("workspace-1");
    expect(invoke).toHaveBeenNthCalledWith(1, "list");
    expect(invoke).toHaveBeenNthCalledWith(2, "open", {
      id: "workspace-1",
      path: "/tmp/repo",
    });
  });
});
