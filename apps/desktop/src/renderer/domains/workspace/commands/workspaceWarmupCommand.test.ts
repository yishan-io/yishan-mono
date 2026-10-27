// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DaemonWorkspaceClient, getWorkspaceRpc } from "../daemon/daemonWorkspaceClient";
import { workspaceStore } from "../state/workspaceStore";
import {
  buildWorkspaceOpenProjectEntries,
  openWorkspaceEntries,
  warmupWorkspacesForProjects,
} from "./workspaceWarmupCommand";

vi.mock("../daemon/daemonWorkspaceClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../daemon/daemonWorkspaceClient")>()),
  getWorkspaceRpc: vi.fn(),
}));

const initialWorkspaceState = workspaceStore.getState();
afterEach(() => {
  workspaceStore.setState(initialWorkspaceState, true);
  vi.resetAllMocks();
});

describe("buildWorkspaceOpenProjectEntries", () => {
  it("excludes error workspaces from open-project warmup so error state is not clobbered", () => {
    const entries = buildWorkspaceOpenProjectEntries(
      [
        { id: "ws-ok", projectId: "project-1", worktreePath: "/tmp/ok" },
        { id: "ws-broken", projectId: "project-1", worktreePath: "/tmp/broken", state: "error" },
      ],
      "org-1",
    );
    expect(entries).toEqual([
      { workspaceId: "ws-ok", worktreePath: "/tmp/ok", projectId: "project-1", orgId: "org-1" },
    ]);
  });

  it("forwards folder kind without adding a kind to normal workspace entries", () => {
    const entries = buildWorkspaceOpenProjectEntries(
      [
        { id: "ws-folder", projectId: "local-folder", worktreePath: "/tmp/folder", kind: "folder" },
        { id: "ws-normal", projectId: "project-1", worktreePath: "/tmp/project", kind: "managed" },
      ],
      "org-1",
    );

    expect(entries).toEqual([
      {
        workspaceId: "ws-folder",
        worktreePath: "/tmp/folder",
        projectId: "local-folder",
        orgId: "org-1",
        kind: "folder",
      },
      {
        workspaceId: "ws-normal",
        worktreePath: "/tmp/project",
        projectId: "project-1",
        orgId: "org-1",
      },
    ]);
  });
});

describe.each(["entries", "projects"] as const)("%s warmup RPC acquisition fence", (mode) => {
  it.each(["invalidated", "current", "default"] as const)("handles a %s fence after RPC acquisition", async (fence) => {
    const entries = [{ workspaceId: "ws", worktreePath: "/old", projectId: "project", orgId: "org" }];
    workspaceStore.setState({
      workspaces: [
        {
          id: "ws",
          projectId: "project",
          repoId: "project",
          name: "Workspace",
          title: "Workspace",
          branch: "main",
          sourceBranch: "main",
          summaryId: "summary",
          worktreePath: "/old",
          state: "active",
        },
      ],
    });
    let resolveRpc!: (rpc: DaemonWorkspaceClient) => void;
    const pendingRpc = new Promise<DaemonWorkspaceClient>((resolve) => {
      resolveRpc = resolve;
    });
    vi.mocked(getWorkspaceRpc).mockReturnValueOnce(pendingRpc);
    const invoke = vi.fn().mockResolvedValue({ opened: ["ws"], skipped: [], errors: [] });
    let current = true;
    const isCurrent = fence === "default" ? undefined : () => current;
    const warming =
      mode === "entries"
        ? openWorkspaceEntries(entries, isCurrent)
        : warmupWorkspacesForProjects(["project"], isCurrent);

    expect(getWorkspaceRpc).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    if (fence === "invalidated") current = false;
    resolveRpc(new DaemonWorkspaceClient(invoke, new Map()));
    await warming;

    if (fence === "invalidated") {
      expect(invoke).not.toHaveBeenCalled();
    } else {
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("workspace.openProject", {
        workspaces: [expect.objectContaining({ workspaceId: "ws", worktreePath: "/old", projectId: "project" })],
      });
    }
  });
});
