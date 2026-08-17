// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { LOCAL_FOLDER_PROJECT_ID } from "../../../../features/project/model/projectTypes";
import type { DaemonLocalFolder } from "../../../../rpc/daemonTypes";
import { createLocalFolderActions } from "./actions.localFolders";

type TestWorkspace = {
  id: string;
  projectId?: string;
  repoId: string;
  name: string;
  title: string;
  sourceBranch: string;
  branch: string;
  summaryId: string;
  worktreePath?: string;
  nodeId?: string;
  kind?: string;
  status?: string;
  state?: string;
  health?: string;
};

type TestProject = {
  id: string;
};

type TestState = {
  projects: TestProject[];
  workspaces: TestWorkspace[];
  selectedProjectId: string;
  selectedWorkspaceId: string;
  gitChangesCountByWorkspaceId: Record<string, number>;
  gitChangeTotalsByWorkspaceId: Record<string, { additions: number; deletions: number }>;
};

/** Creates a minimal state harness for local-folder store actions. */
function createHarness(initial: Partial<TestState> = {}) {
  const state: TestState = {
    projects: [{ id: "repo-1" }],
    workspaces: [
      {
        id: "workspace-1",
        projectId: "repo-1",
        repoId: "repo-1",
        name: "existing",
        title: "Existing",
        sourceBranch: "main",
        branch: "main",
        summaryId: "workspace-1",
        worktreePath: "/tmp/repo-1/.worktrees/existing",
      },
    ],
    selectedProjectId: "repo-1",
    selectedWorkspaceId: "workspace-1",
    gitChangesCountByWorkspaceId: {},
    gitChangeTotalsByWorkspaceId: {},
    ...initial,
  };

  const set = ((updater: ((current: TestState) => void) | Partial<TestState>) => {
    if (typeof updater === "function") {
      updater(state);
    } else {
      Object.assign(state, updater);
    }
  }) as Parameters<typeof createLocalFolderActions>[0];

  const get = (() => state) as unknown as Parameters<typeof createLocalFolderActions>[1];
  const actions = createLocalFolderActions(set, get);

  return {
    actions,
    getState: () => state,
  };
}

function folder(overrides: Partial<DaemonLocalFolder> & { id: string; path: string }): DaemonLocalFolder {
  return { state: "active", health: "not-worktree", ...overrides };
}

describe("createLocalFolderActions", () => {
  it("maps daemon records to folder workspace items", () => {
    const harness = createHarness();

    harness.actions.loadLocalFolders([
      folder({ id: "folder-1", path: "/data/projects/my-app/a-folder" }),
      folder({ id: "folder-2", path: "/data/tools", name: "  Tools  " }),
    ]);

    const folders = harness.getState().workspaces.filter((w) => w.projectId === LOCAL_FOLDER_PROJECT_ID);
    expect(folders).toHaveLength(2);

    expect(folders[0]).toMatchObject({
      id: "folder-1",
      projectId: LOCAL_FOLDER_PROJECT_ID,
      repoId: "folder-1",
      name: "a-folder",
      title: "a-folder",
      sourceBranch: "",
      branch: "",
      summaryId: "folder-1",
      worktreePath: "/data/projects/my-app/a-folder",
      kind: "folder",
      status: "active",
      state: "active",
      health: "not-worktree",
    });

    // name is taken from the explicit `name` and trimmed.
    expect(folders[1]?.name).toBe("Tools");
    // non-folder workspaces are untouched.
    expect(harness.getState().workspaces.some((w) => w.id === "workspace-1")).toBe(true);
  });

  it("falls back to the path for a root filesystem path so the item never renders an empty title", () => {
    const harness = createHarness();

    harness.actions.loadLocalFolders([folder({ id: "root-folder", path: "/" })]);

    const folderItem = harness.getState().workspaces.find((w) => w.id === "root-folder");
    expect(folderItem?.name).toBe("/");
    expect(folderItem?.title).toBe("/");
  });

  it("replaces the prior folder subset and is idempotent across repeated calls", () => {
    const harness = createHarness();
    harness.actions.loadLocalFolders([folder({ id: "folder-1", path: "/a" })]);

    // Second snapshot merges a new folder and re-emits the existing one; folder-1 must not duplicate.
    harness.actions.loadLocalFolders([
      folder({ id: "folder-1", path: "/a/renamed" }),
      folder({ id: "folder-2", path: "/b" }),
    ]);

    const workspaceState = harness.getState().workspaces;
    const folderItems = workspaceState.filter((w) => w.projectId === LOCAL_FOLDER_PROJECT_ID);
    expect(folderItems).toHaveLength(2);
    expect(workspaceState.filter((w) => w.id === "folder-1")).toHaveLength(1);
    // folder-1 was refreshed with the new path (name updated via basename).
    expect(workspaceState.find((w) => w.id === "folder-1")?.worktreePath).toBe("/a/renamed");
    expect(workspaceState.find((w) => w.id === "folder-1")?.name).toBe("renamed");
    expect(workspaceState.filter((w) => w.id === "folder-2")).toHaveLength(1);
  });

  it("dedupes folder ids within a single snapshot", () => {
    const harness = createHarness();

    harness.actions.loadLocalFolders([folder({ id: "folder-1", path: "/a" }), folder({ id: "folder-1", path: "/a" })]);

    expect(harness.getState().workspaces.filter((w) => w.id === "folder-1")).toHaveLength(1);
  });

  it("adds a new folder and updates an existing one by id", () => {
    const harness = createHarness();
    harness.actions.addLocalFolder(folder({ id: "folder-1", path: "/a" }));
    expect(harness.getState().workspaces.find((w) => w.id === "folder-1")?.worktreePath).toBe("/a");

    // Updating by id should not create a duplicate.
    harness.actions.addLocalFolder(folder({ id: "folder-1", path: "/a/renamed", name: "New Name" }));
    const folderItems = harness.getState().workspaces.filter((w) => w.id === "folder-1");
    expect(folderItems).toHaveLength(1);
    expect(folderItems[0]?.name).toBe("New Name");
    expect(folderItems[0]?.worktreePath).toBe("/a/renamed");
  });

  it("removes a folder and clears selection and cached git state", () => {
    const harness = createHarness({
      workspaces: [
        { id: "workspace-1", repoId: "repo-1", name: "x", title: "X", sourceBranch: "m", branch: "m", summaryId: "w1" },
        {
          id: "folder-1",
          repoId: "folder-1",
          name: "F",
          title: "F",
          sourceBranch: "",
          branch: "",
          summaryId: "folder-1",
        },
      ],
      selectedWorkspaceId: "folder-1",
      selectedProjectId: LOCAL_FOLDER_PROJECT_ID,
      gitChangesCountByWorkspaceId: { "folder-1": 3 },
      gitChangeTotalsByWorkspaceId: { "folder-1": { additions: 5, deletions: 2 } },
    });

    harness.actions.removeLocalFolder("folder-1");

    const state = harness.getState();
    expect(state.workspaces.some((w) => w.id === "folder-1")).toBe(false);
    expect(state.gitChangesCountByWorkspaceId["folder-1"]).toBeUndefined();
    expect(state.gitChangeTotalsByWorkspaceId["folder-1"]).toBeUndefined();
    // Selection falls back to the next workspace.
    expect(state.selectedWorkspaceId).toBe("workspace-1");
    // The sentinel project id is reset to a real project.
    expect(state.selectedProjectId).toBe("repo-1");
  });

  it("keeps the sentinel project id when another folder remains selected", () => {
    const harness = createHarness({
      workspaces: [
        {
          id: "folder-1",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          repoId: "folder-1",
          name: "F1",
          title: "F1",
          sourceBranch: "",
          branch: "",
          summaryId: "folder-1",
        },
        {
          id: "folder-2",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          repoId: "folder-2",
          name: "F2",
          title: "F2",
          sourceBranch: "",
          branch: "",
          summaryId: "folder-2",
        },
      ],
      selectedWorkspaceId: "folder-1",
      selectedProjectId: LOCAL_FOLDER_PROJECT_ID,
    });

    harness.actions.removeLocalFolder("folder-1");

    const state = harness.getState();
    expect(state.selectedWorkspaceId).toBe("folder-2");
    expect(state.selectedProjectId).toBe(LOCAL_FOLDER_PROJECT_ID);
  });

  it("does not clear an unrelated selection when removing a folder", () => {
    const harness = createHarness({
      workspaces: [
        { id: "workspace-1", repoId: "repo-1", name: "x", title: "X", sourceBranch: "m", branch: "m", summaryId: "w1" },
        {
          id: "folder-1",
          repoId: "folder-1",
          name: "F",
          title: "F",
          sourceBranch: "",
          branch: "",
          summaryId: "folder-1",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });

    harness.actions.removeLocalFolder("folder-1");
    expect(harness.getState().selectedWorkspaceId).toBe("workspace-1");
    expect(harness.getState().selectedProjectId).toBe("repo-1");
  });
});
