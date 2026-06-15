import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDaemonClient, getWorkspaceStoreState, getSessionStoreState } = vi.hoisted(() => ({
  getDaemonClient: vi.fn(),
  getWorkspaceStoreState: vi.fn(),
  getSessionStoreState: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient,
}));

vi.mock("../store/workspaceStore", () => ({
  workspaceStore: {
    getState: getWorkspaceStoreState,
  },
}));

vi.mock("../store/sessionStore", () => ({
  sessionStore: {
    getState: getSessionStoreState,
  },
}));

import { ensureVisibleWorkspacesOpen } from "./daemonWorkspaceSync";

describe("ensureVisibleWorkspacesOpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionStoreState.mockReturnValue({ daemonId: "node-1" });
  });

  it("reopens daemon workspaces when the same path is registered under stale metadata", async () => {
    const open = vi.fn(async () => ({ id: "workspace-1", path: "/tmp/repo" }));
    const list = vi.fn(async () => [{ id: "workspace-stale", path: "/tmp/repo", orgId: "", projectId: "" }]);
    getDaemonClient.mockResolvedValue({
      workspace: {
        list,
        open,
      },
    });
    getWorkspaceStoreState.mockReturnValue({
      displayProjectIds: ["project-1"],
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-1",
          repoId: "project-1",
          nodeId: "node-1",
          worktreePath: "/tmp/repo",
        },
      ],
      setWorkspacePullRequest: vi.fn(),
    });

    await ensureVisibleWorkspacesOpen();

    expect(open).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workspaceWorktreePath: "/tmp/repo",
      orgId: "org-1",
      projectId: "project-1",
      pullRequestAlreadyMerged: false,
    });
  });

  it("skips visible workspaces that belong to another node", async () => {
    const open = vi.fn();
    const list = vi.fn(async () => []);
    getDaemonClient.mockResolvedValue({
      workspace: {
        list,
        open,
      },
    });
    getWorkspaceStoreState.mockReturnValue({
      displayProjectIds: ["project-1"],
      workspaces: [
        {
          id: "workspace-remote",
          organizationId: "org-1",
          projectId: "project-1",
          repoId: "project-1",
          nodeId: "node-2",
          worktreePath: "/tmp/remote-repo",
        },
      ],
      setWorkspacePullRequest: vi.fn(),
    });

    await ensureVisibleWorkspacesOpen();

    expect(open).not.toHaveBeenCalled();
  });

  it("does not close the workspace when daemon open fails", async () => {
    const open = vi.fn(async () => {
      throw new Error("path not available");
    });
    const close = vi.fn();
    const list = vi.fn(async () => []);
    getDaemonClient.mockResolvedValue({
      workspace: {
        list,
        open,
        close,
      },
    });
    getWorkspaceStoreState.mockReturnValue({
      displayProjectIds: ["project-1"],
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-1",
          repoId: "project-1",
          nodeId: "node-1",
          branch: "feature-a",
          worktreePath: "/tmp/repo",
        },
      ],
      setWorkspacePullRequest: vi.fn(),
    });

    await ensureVisibleWorkspacesOpen();

    expect(open).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });
});
