import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDaemonClient, getWorkspaceStoreState } = vi.hoisted(() => ({
  getDaemonClient: vi.fn(),
  getWorkspaceStoreState: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient,
}));

vi.mock("../store/workspaceStore", () => ({
  workspaceStore: {
    getState: getWorkspaceStoreState,
  },
}));

import { ensureVisibleWorkspacesOpen } from "./daemonWorkspaceSync";

describe("ensureVisibleWorkspacesOpen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
