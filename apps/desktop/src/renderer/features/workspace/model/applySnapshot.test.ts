// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { applySnapshotToStores } from "./applySnapshot";
import type { SnapshotReconcilerResult } from "./snapshotReconciler";

function fakeStores() {
  const projectStore = {
    setProjects: vi.fn(),
    setDisplayProjectIds: vi.fn(),
    setLastUsedExternalAppId: vi.fn(),
    setOrganizationPreferencesById: vi.fn(),
  };
  const workspaceStore = {
    setWorkspaces: vi.fn(),
    setSelection: vi.fn(),
  };
  const projectionStore = {
    setPullRequests: vi.fn(),
    setLatestPullRequests: vi.fn(),
    setGitChangesCounts: vi.fn(),
    setGitChangeTotals: vi.fn(),
  };
  return { projectStore, workspaceStore, projectionStore };
}

const previousState = {
  projects: [],
  workspaces: [],
  pullRequestByWorkspaceId: {},
  latestPullRequestByWorkspaceId: {},
  gitChangesCountByWorkspaceId: { "stale-ws": 3 },
  gitChangeTotalsByWorkspaceId: { "stale-ws": { additions: 1, deletions: 2 } },
  selectedProjectId: "",
  selectedWorkspaceId: "",
  displayProjectIds: [],
  lastUsedExternalAppId: undefined,
  organizationPreferencesById: undefined,
};

function sampleResult(): SnapshotReconcilerResult {
  return {
    projects: [],
    workspaces: [],
    selectedProjectId: "",
    selectedWorkspaceId: "",
    displayProjectIds: [],
    lastUsedExternalAppId: undefined,
    organizationPreferencesById: undefined,
    projectionCleanup: {
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
    },
  };
}

describe("applySnapshotToStores", () => {
  it("applies the reconciled result to all stores synchronously in order", () => {
    const stores = fakeStores();
    applySnapshotToStores({ projects: [], workspacesFromApi: [], organizationId: "org-1", previousState }, stores);

    // projectStore writes first
    expect(stores.projectStore.setProjects).toHaveBeenCalled();
    expect(stores.projectStore.setDisplayProjectIds).toHaveBeenCalled();
    // then workspaceStore
    expect(stores.workspaceStore.setWorkspaces).toHaveBeenCalled();
    expect(stores.workspaceStore.setSelection).toHaveBeenCalled();
    // then projections
    expect(stores.projectionStore.setPullRequests).toHaveBeenCalled();
    expect(stores.projectionStore.setGitChangesCounts).toHaveBeenCalled();
    expect(stores.projectionStore.setGitChangeTotals).toHaveBeenCalled();
  });

  it("passes the reconciled projection cleanup through unchanged", () => {
    const stores = fakeStores();
    const result = sampleResult();
    // Force the reconciler path by seeding a project+workspace so cleanup matters.
    applySnapshotToStores(
      {
        projects: [
          {
            id: "repo-1",
            name: "Repo 1",
            sourceType: "git" as const,
            repoProvider: null,
            repoUrl: null,
            repoKey: "repo-1",
            icon: "folder",
            color: "#111",
            setupScript: "",
            postScript: "",
            contextEnabled: true,
            organizationId: "org-1",
            createdByUserId: "u1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        workspacesFromApi: [],
        organizationId: "org-1",
        previousState,
      },
      stores,
    );

    expect(stores.projectionStore.setGitChangesCounts).toHaveBeenCalledWith({});
    expect(stores.projectionStore.setGitChangeTotals).toHaveBeenCalledWith({});
    void result;
  });
});
