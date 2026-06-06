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
});
