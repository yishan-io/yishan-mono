import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let projectionListener: ((state: { gitRefreshVersionByWorktreePath: Record<string, number> }) => void) | undefined;
  const projectionState = { gitRefreshVersionByWorktreePath: {} as Record<string, number> };
  return {
    inspectGitRepositoryPath: vi.fn(),
    promoteGitLocalProject: vi.fn(),
    workspaceState: { workspaces: [] as Array<{ id: string; projectId: string; worktreePath: string }> },
    projectState: { projects: [] as Array<{ id: string; sourceType: string }> },
    projectionState,
    subscribe: vi.fn((listener) => {
      projectionListener = listener;
      return vi.fn();
    }),
    emitProjection: (versionByWorktreePath: Record<string, number>) => {
      projectionState.gitRefreshVersionByWorktreePath = versionByWorktreePath;
      projectionListener?.(projectionState);
    },
  };
});

vi.mock("@renderer/domains/git", () => ({
  inspectGitRepositoryPath: mocks.inspectGitRepositoryPath,
  gitProjectionStore: {
    subscribe: mocks.subscribe,
  },
}));
vi.mock("@renderer/domains/workspace", () => ({
  isFolderWorkspace: () => false,
  workspaceStore: { getState: () => mocks.workspaceState },
}));
vi.mock("../state/projectStore", () => ({
  projectStore: { getState: () => mocks.projectState },
}));
vi.mock("../commands/projectCommands", () => ({
  promoteGitLocalProject: mocks.promoteGitLocalProject,
}));

import { createGitLocalProjectPromotionRuntime } from "./gitLocalProjectPromotionRuntime";

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  mocks.inspectGitRepositoryPath.mockReset();
  mocks.promoteGitLocalProject.mockReset();
  mocks.subscribe.mockClear();
  mocks.workspaceState.workspaces = [];
  mocks.projectState.projects = [];
  mocks.projectionState.gitRefreshVersionByWorktreePath = {};
});

describe("git-local project promotion runtime", () => {
  it("promotes a git-local project when initial inspection finds an origin remote", async () => {
    mocks.workspaceState.workspaces = [{ id: "workspace-1", projectId: "project-1", worktreePath: "/tmp/project" }];
    mocks.projectState.projects = [{ id: "project-1", sourceType: "git-local" }];
    mocks.inspectGitRepositoryPath.mockResolvedValue({
      isGitRepository: true,
      remoteUrl: "git@github.com:acme/project.git",
    });
    const runtime = createGitLocalProjectPromotionRuntime();

    runtime.start();
    await flushPromises();

    expect(mocks.inspectGitRepositoryPath).toHaveBeenCalledWith({ path: "/tmp/project" });
    expect(mocks.promoteGitLocalProject).toHaveBeenCalledWith("project-1", "git@github.com:acme/project.git");
  });

  it("skips projects without an origin remote", async () => {
    mocks.workspaceState.workspaces = [{ id: "workspace-1", projectId: "project-1", worktreePath: "/tmp/project" }];
    mocks.projectState.projects = [{ id: "project-1", sourceType: "git-local" }];
    mocks.inspectGitRepositoryPath.mockResolvedValue({ isGitRepository: true });

    createGitLocalProjectPromotionRuntime().start();
    await flushPromises();

    expect(mocks.promoteGitLocalProject).not.toHaveBeenCalled();
  });

  it("checks a project when its primary path changes after a managed workspace was listed first", async () => {
    mocks.workspaceState.workspaces = [
      { id: "workspace-managed", projectId: "project-1", worktreePath: "/tmp/project-worktrees/task" },
      { id: "workspace-primary", projectId: "project-1", worktreePath: "/tmp/project" },
    ];
    mocks.projectState.projects = [{ id: "project-1", sourceType: "git-local" }];
    mocks.inspectGitRepositoryPath.mockResolvedValue({
      isGitRepository: true,
      remoteUrl: "https://github.com/acme/project.git",
    });
    const runtime = createGitLocalProjectPromotionRuntime();

    runtime.start();
    await flushPromises();
    mocks.inspectGitRepositoryPath.mockClear();
    mocks.promoteGitLocalProject.mockClear();

    mocks.emitProjection({ "/tmp/project": 1 });
    await flushPromises();

    expect(mocks.inspectGitRepositoryPath).toHaveBeenCalledWith({ path: "/tmp/project" });
    expect(mocks.promoteGitLocalProject).toHaveBeenCalledWith("project-1", "https://github.com/acme/project.git");
  });

  it("coalesces duplicate Git projection events while a project check is in flight", async () => {
    let resolveInspection!: (value: { isGitRepository: boolean; remoteUrl: string }) => void;
    mocks.workspaceState.workspaces = [{ id: "workspace-1", projectId: "project-1", worktreePath: "/tmp/project" }];
    mocks.projectState.projects = [{ id: "project-1", sourceType: "git-local" }];
    mocks.inspectGitRepositoryPath.mockReturnValue(
      new Promise((resolve) => {
        resolveInspection = resolve;
      }),
    );
    const runtime = createGitLocalProjectPromotionRuntime();

    runtime.start();
    mocks.emitProjection({ "/tmp/project": 1 });
    mocks.emitProjection({ "/tmp/project": 2 });
    resolveInspection({ isGitRepository: true, remoteUrl: "https://github.com/acme/project.git" });
    await flushPromises();

    expect(mocks.inspectGitRepositoryPath).toHaveBeenCalledTimes(1);
    expect(mocks.promoteGitLocalProject).toHaveBeenCalledTimes(1);
  });
});
