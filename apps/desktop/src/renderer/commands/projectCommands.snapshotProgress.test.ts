// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "../store/sessionStore";
import { tabStore } from "../store/tabStore";
import { workspaceCreateProgressStore } from "../store/workspaceCreateProgressStore";
import { workspaceStore } from "../store/workspaceStore";
import { loadWorkspaceSnapshot } from "./projectCommands";

const apiMocks = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("../api", () => ({
  api: {
    org: {
      list: apiMocks.listOrganizations,
    },
    project: {
      listByOrg: apiMocks.listProjects,
    },
  },
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSessionStoreState = sessionStore.getState();
const initialWorkspaceCreateProgressState = workspaceCreateProgressStore.getState();

afterEach(() => {
  localStorage.clear();
  workspaceStore.setState(initialWorkspaceStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressState, true);
  vi.clearAllMocks();
});

describe("loadWorkspaceSnapshot progress reconciliation", () => {
  it("completes stale create progress for hydrated active workspaces", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
    workspaceCreateProgressStore.getState().startWorkspaceCreateProgress("workspace-1");
    apiMocks.listProjects.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Project 1",
        sourceType: "git",
        repoProvider: "github",
        repoUrl: "https://github.com/test/project-1.git",
        repoKey: "project-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: "user-1",
        workspaces: [
          {
            id: "workspace-1",
            organizationId: "org-1",
            projectId: "project-1",
            userId: "user-1",
            nodeId: "node-1",
            kind: "worktree",
            status: "active",
            branch: "feature-a",
            sourceBranch: "main",
            localPath: "/tmp/workspaces/project-1/feature-a",
            latestPullRequest: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ]);

    await loadWorkspaceSnapshot();

    expect(workspaceCreateProgressStore.getState().progressByWorkspaceId["workspace-1"]?.isComplete).toBe(true);
  });

  it("keeps create progress incomplete for provisioning or pathless hydrated workspaces", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
    workspaceCreateProgressStore.getState().startWorkspaceCreateProgress("workspace-provisioning");
    workspaceCreateProgressStore.getState().startWorkspaceCreateProgress("workspace-pathless");
    apiMocks.listProjects.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Project 1",
        sourceType: "git",
        repoProvider: "github",
        repoUrl: "https://github.com/test/project-1.git",
        repoKey: "project-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: "user-1",
        workspaces: [
          {
            id: "workspace-provisioning",
            organizationId: "org-1",
            projectId: "project-1",
            userId: "user-1",
            nodeId: "node-1",
            kind: "worktree",
            status: "provisioning",
            branch: "feature-a",
            sourceBranch: "main",
            localPath: "/tmp/workspaces/project-1/feature-a",
            latestPullRequest: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "workspace-pathless",
            organizationId: "org-1",
            projectId: "project-1",
            userId: "user-1",
            nodeId: "node-1",
            kind: "worktree",
            status: "active",
            branch: "feature-b",
            sourceBranch: "main",
            localPath: "",
            latestPullRequest: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ]);

    await loadWorkspaceSnapshot();

    const state = workspaceCreateProgressStore.getState();
    expect(state.progressByWorkspaceId["workspace-provisioning"]?.isComplete).toBe(false);
    expect(state.progressByWorkspaceId["workspace-pathless"]?.isComplete).toBe(false);
  });
});
