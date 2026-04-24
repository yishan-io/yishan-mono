// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../store/chatStore";
import { sessionStore } from "../store/sessionStore";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { createRepo, deleteRepo, loadWorkspaceFromBackend, updateRepoConfig } from "./projectCommands";

const apiMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  fetchOrgProjectSnapshot: vi.fn(),
  queryClientFetchQuery: vi.fn(),
}));

vi.mock("../api/orgProjectApi", () => ({
  createProject: apiMocks.createProject,
}));

vi.mock("../api/orgProjectQueries", () => ({
  getOrgProjectSnapshot: apiMocks.fetchOrgProjectSnapshot,
}));

vi.mock("../queryClient", () => ({
  rendererQueryClient: {
    fetchQuery: apiMocks.queryClientFetchQuery,
  },
}));

const rpcMocks = vi.hoisted(() => ({
  createRepo: vi.fn(),
  deleteRepo: vi.fn(),
  gitInspect: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getApiServiceClient: vi.fn(async () => ({
    git: {
      inspect: rpcMocks.gitInspect,
    },
    repo: {
      createRepo: rpcMocks.createRepo,
      deleteRepo: rpcMocks.deleteRepo,
    },
  })),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialTabStoreState = tabStore.getState();
const initialChatStoreState = chatStore.getState();
const initialSessionStoreState = sessionStore.getState();

afterEach(() => {
  localStorage.clear();
  workspaceStore.setState(initialWorkspaceStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  vi.clearAllMocks();
});

describe("projectCommands", () => {
  it("loads backend snapshot and hydrates store", async () => {
    const hydrate = vi.fn();
    const retainWorkspaceTabs = vi.fn().mockReturnValue([]);
    const setSelectedWorkspaceId = vi.fn();
    tabStore.setState({ retainWorkspaceTabs, setSelectedWorkspaceId });
    workspaceStore.setState({ loadWorkspaceFromBackend: hydrate });
    apiMocks.queryClientFetchQuery.mockResolvedValueOnce({
      organizationId: "org-1",
      projects: [
        {
          id: "project-1",
          name: "Project 1",
          sourceType: "git",
          repoProvider: "github",
          repoUrl: "https://github.com/test/project-1.git",
          repoKey: "project-1",
        },
      ],
      workspaces: [],
    });

    await loadWorkspaceFromBackend();

    expect(apiMocks.queryClientFetchQuery).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(hydrate.mock.calls[0]?.[0]).toEqual({
      repos: [
        {
          id: "project-1",
          key: "project-1",
          name: "Project 1",
          localPath: "",
          gitUrl: "https://github.com/test/project-1.git",
          worktreePath: "",
          privateContextEnabled: true,
          defaultBranch: "main",
          icon: "folder",
          color: "#1E66F5",
          setupScript: "",
          postScript: "",
        },
      ],
      workspaces: [],
    });
    expect(retainWorkspaceTabs).toHaveBeenCalledTimes(1);
    expect(setSelectedWorkspaceId).toHaveBeenCalledTimes(1);
  });

  it("creates backend repo and then appends store state", async () => {
    const appendRepo = vi.fn();
    workspaceStore.setState({ createRepo: appendRepo });
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    rpcMocks.gitInspect.mockResolvedValueOnce({
      isGitRepository: true,
      remoteUrl: "https://github.com/test/repo-1.git",
      currentBranch: "main",
    });
    apiMocks.createProject.mockResolvedValueOnce({
      id: "project-1",
      name: "Repo 1",
      sourceType: "git-local",
      repoProvider: null,
      repoUrl: null,
      repoKey: "repo-1",
    });

    await createRepo({
      name: "Repo 1",
      key: "repo-1",
      source: "local",
      path: "/tmp/repo-1",
    });

    expect(apiMocks.createProject).toHaveBeenCalledWith("org-1", {
      name: "Repo 1",
      sourceTypeHint: "git-local",
      repoUrl: "https://github.com/test/repo-1.git",
      localPath: "/tmp/repo-1",
    });
    expect(appendRepo).toHaveBeenCalledTimes(1);
    expect(appendRepo.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        backendRepo: expect.objectContaining({
          defaultBranch: "main",
        }),
      }),
    );
  });

  it("deletes backend repo and then removes repo from store", async () => {
    const removeRepo = vi.fn();
    const retainWorkspaceTabs = vi.fn().mockReturnValue(["tab-1"]);
    const setSelectedWorkspaceId = vi.fn();
    const removeTabData = vi.fn();
    const removeWorkspaceTaskCounts = vi.fn();

    tabStore.setState({ retainWorkspaceTabs, setSelectedWorkspaceId });
    chatStore.setState({ removeTabData, removeWorkspaceTaskCounts });
    workspaceStore.setState({ deleteRepo: removeRepo });
    rpcMocks.deleteRepo.mockResolvedValueOnce({
      repoId: "repo-1",
      deletedWorkspaceIds: ["workspace-1"],
      repoDeleted: true,
    });

    await deleteRepo("repo-1");

    expect(rpcMocks.deleteRepo).toHaveBeenCalledWith({ repoId: "repo-1" });
    expect(removeRepo).toHaveBeenCalledWith("repo-1");
    expect(retainWorkspaceTabs).toHaveBeenCalledTimes(1);
    expect(setSelectedWorkspaceId).toHaveBeenCalledTimes(1);
    expect(removeTabData).toHaveBeenCalledWith(["tab-1"]);
    expect(removeWorkspaceTaskCounts).not.toHaveBeenCalled();
  });

  it("persists config and updates local store fields", async () => {
    const applyRepoConfig = vi.fn();
    const bumpRefreshVersion = vi.fn();
    workspaceStore.setState({
      repos: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          gitUrl: "",
          worktreePath: "/tmp/repo-1",
        },
      ],
      updateRepoConfig: applyRepoConfig,
      incrementFileTreeRefreshVersion: bumpRefreshVersion,
    });
    rpcMocks.createRepo.mockResolvedValueOnce({
      id: "repo-1",
      key: "repo-1",
      localPath: "/tmp/repo-1",
      worktreePath: "/tmp/repo-1",
      gitUrl: "",
      contextEnabled: true,
      icon: null,
      color: null,
      setupScript: "",
      postScript: "",
      defaultBranch: null,
    });

    await updateRepoConfig("repo-1", {
      name: "Repo 1",
      worktreePath: "/tmp/repo-1",
      privateContextEnabled: true,
      icon: "folder",
      iconBgColor: "#1E66F5",
      setupScript: "npm ci",
      postScript: "rm -rf node_modules",
    });

    expect(rpcMocks.createRepo).toHaveBeenCalledTimes(1);
    expect(rpcMocks.createRepo.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        key: "repo-1",
        worktreePath: "/tmp/repo-1",
      }),
    );
    expect(applyRepoConfig).toHaveBeenCalledTimes(1);
    expect(bumpRefreshVersion).toHaveBeenCalledTimes(1);
  });
});
