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
});
