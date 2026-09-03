// @vitest-environment jsdom

import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { describe, expect, it } from "vitest";
import { createWorkspaceActions } from "./actions.workspaces";

type TestState = {
  projects: Array<{ id: string; localPath?: string; worktreePath: string }>;
  workspaces: Array<{
    id: string;
    projectId?: string;
    repoId: string;
    name: string;
    title: string;
    sourceBranch: string;
    branch: string;
    summaryId: string;
    worktreePath?: string;
  }>;
  pullRequestByWorkspaceId: Record<string, unknown>;
  gitChangesCountByWorkspaceId: Record<string, number>;
  gitChangeTotalsByWorkspaceId: Record<string, { additions: number; deletions: number }>;
  gitRefreshVersionByWorktreePath: Record<string, number>;
};

/** Creates a minimal state harness for workspace store actions with immer-style mutation. */
function createHarness() {
  const state: TestState = {
    projects: [
      {
        id: "repo-1",
        localPath: "/tmp/repo-1",
        worktreePath: "/tmp/repo-1",
      },
    ],
    workspaces: [
      {
        id: "workspace-1",
        repoId: "repo-1",
        name: "existing",
        title: "Existing",
        sourceBranch: "main",
        branch: "main",
        summaryId: "workspace-1",
        worktreePath: "/tmp/repo-1/.worktrees/existing",
      },
    ],
    pullRequestByWorkspaceId: {},
    gitChangesCountByWorkspaceId: {},
    gitChangeTotalsByWorkspaceId: {},
    gitRefreshVersionByWorktreePath: {},
  };

  const set = ((updater: ((current: TestState) => void) | Partial<TestState>) => {
    if (typeof updater === "function") {
      updater(state);
    } else {
      Object.assign(state, updater);
    }
  }) as Parameters<typeof createWorkspaceActions>[0];

  const get = (() => state) as unknown as Parameters<typeof createWorkspaceActions>[1];
  const actions = createWorkspaceActions(set, get);

  return {
    actions,
    getState: () => state,
  };
}

describe("createWorkspaceActions", () => {
  it("preserves local-folder workspaces until their authoritative snapshot loads", () => {
    const harness = createHarness();
    harness.getState().workspaces.push({
      id: "folder-1",
      projectId: LOCAL_FOLDER_PROJECT_ID,
      repoId: "folder-1",
      name: "My Folder",
      title: "My Folder",
      sourceBranch: "",
      branch: "",
      summaryId: "folder-1",
    });

    harness.actions.load("org-1", [
      {
        id: "workspace-2",
        repoId: "repo-1",
        name: "loaded",
        title: "Loaded",
        sourceBranch: "main",
        branch: "loaded",
        summaryId: "workspace-2",
      },
    ]);

    expect(harness.getState().workspaces.map((workspace) => workspace.id)).toEqual(["workspace-2", "folder-1"]);
  });

  it("adds workspace state and updates selection", () => {
    const harness = createHarness();

    harness.actions.addWorkspace({
      repoId: "repo-1",
      name: "feature-a",
      sourceBranch: "main",
      branch: "feature-a",
      worktreePath: "/tmp/repo-1/.worktrees/feature-a",
      workspaceId: "workspace-2",
    });

    const state = harness.getState();
    expect(state.workspaces.some((workspace) => workspace.id === "workspace-2")).toBe(true);
  });

  it("renames the matching workspace and updates its title", () => {
    const harness = createHarness();

    harness.actions.renameWorkspace({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      name: "Feature Updated",
    });

    const renamedWorkspace = harness.getState().workspaces.find((workspace) => workspace.id === "workspace-1");
    expect(renamedWorkspace?.name).toBe("Feature Updated");
    expect(renamedWorkspace?.title).toBe("Feature Updated");
  });

  it("renames the matching workspace branch", () => {
    const harness = createHarness();

    harness.actions.renameWorkspaceBranch({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      branch: "feature/updated",
    });

    const renamedWorkspace = harness.getState().workspaces.find((workspace) => workspace.id === "workspace-1");
    expect(renamedWorkspace?.branch).toBe("feature/updated");
  });
});
