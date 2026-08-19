// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { type SnapshotReconcilerInput, reconcileWorkspaceSnapshot } from "./snapshotReconciler";
import type { ProjectRecord, WorkspaceRecord } from "@renderer/api/types";
import type { WorkspaceItem, WorkspaceStatus } from "@renderer/domains/workspace";

function buildProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "repo-1",
    name: "yishan-mono",
    sourceType: "git",
    repoProvider: "github",
    repoUrl: "https://github.com/yishan-io/yishan-mono",
    repoKey: "yishan-io/yishan-mono",
    icon: "code",
    color: "#1E66F5",
    setupScript: "",
    postScript: "",
    contextEnabled: true,
    organizationId: "org-1",
    createdByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function buildWorkspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    id: "ws-1",
    organizationId: "org-1",
    projectId: "repo-1",
    userId: "user-1",
    nodeId: "node-1",
    kind: "primary",
    status: "active",
    branch: "main",
    sourceBranch: "main",
    localPath: "/worktrees/yishan-mono",
    latestPullRequest: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function reconcile(
  input: Partial<SnapshotReconcilerInput> & Pick<SnapshotReconcilerInput, "organizationId" | "previousState">,
): ReturnType<typeof reconcileWorkspaceSnapshot> {
  return reconcileWorkspaceSnapshot({
    projects: input.projects ?? [],
    workspacesFromApi: input.workspacesFromApi ?? [],
    organizationId: input.organizationId,
    previousState: input.previousState,
  });
}

function emptyPreviousState(): SnapshotReconcilerInput["previousState"] {
  return {
    projects: [],
    workspaces: [],
    selectedProjectId: undefined,
    selectedWorkspaceId: undefined,
    displayProjectIds: undefined,
    lastUsedExternalAppId: undefined,
    organizationPreferencesById: undefined,
  };
}

describe("reconcileWorkspaceSnapshot (moves to app/commands after P30)", () => {
  it("maps projects and managed workspaces from the backend snapshot", () => {
    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace({ kind: "worktree" })],
      organizationId: "org-1",
      previousState: emptyPreviousState(),
    });

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({
      id: "repo-1",
      name: "yishan-mono",
      worktreePath: "/worktrees/yishan-mono",
      missing: false,
    });
    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0]).toMatchObject({
      id: "ws-1",
      // display metadata: worktree rows use the branch as name and the
      // worktree path file name as title (workspaceDisplayNames.ts)
      name: "main",
      title: "yishan-mono",
      kind: "managed",
      status: "active",
    });
  });

  it("labels a primary workspace row with the local display name", () => {
    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace({ kind: "primary" })],
      organizationId: "org-1",
      previousState: emptyPreviousState(),
    });

    expect(result.workspaces[0]?.name).toBe("local");
    expect(result.workspaces[0]?.title).toBe("local");
  });

  it("drops closed workspace rows (tombstones)", () => {
    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace({ status: "closed" })],
      organizationId: "org-1",
      previousState: emptyPreviousState(),
    });

    expect(result.workspaces).toHaveLength(0);
  });

  it("falls back to the file name for display when the repo name is empty", () => {
    const result = reconcile({
      projects: [buildProject({ name: "" })],
      workspacesFromApi: [buildWorkspace()],
      organizationId: "org-1",
      previousState: emptyPreviousState(),
    });

    expect(result.projects[0]?.name).toBe("yishan-mono");
  });

  it("preserves pending workspace display metadata during hydration", () => {
    const previous = emptyPreviousState();
    previous.workspaces = [
      {
        id: "ws-new",
        repoId: "repo-1",
        name: "My Pending Workspace",
        title: "My Pending Workspace",
        sourceBranch: "feature/x",
        branch: "feature/x",
        summaryId: "ws-new",
        status: "provisioning",
      } satisfies WorkspaceItem,
    ];

    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace({ id: "ws-new", status: "provisioning", localPath: "" })],
      organizationId: "org-1",
      previousState: previous,
    });

    const preserved = result.workspaces.find((workspace) => workspace.id === "ws-new");
    expect(preserved).toBeDefined();
    expect(preserved?.name).toBe("My Pending Workspace");
    expect(preserved?.title).toBe("My Pending Workspace");
  });

  it("never downgrades a completed local workspace to provisioning", () => {
    const previous = emptyPreviousState();
    previous.workspaces = [
      {
        id: "ws-1",
        repoId: "repo-1",
        name: "yishan-mono",
        title: "yishan-mono",
        sourceBranch: "main",
        branch: "main",
        summaryId: "ws-1",
        worktreePath: "/worktrees/yishan-mono",
        status: "active",
      } satisfies WorkspaceItem,
    ];

    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace({ status: "provisioning" })],
      organizationId: "org-1",
      previousState: previous,
    });

    const preserved = result.workspaces.find((workspace) => workspace.id === "ws-1");
    expect(preserved?.status).toBe("active");
    expect(preserved?.worktreePath).toBe("/worktrees/yishan-mono");
  });

  it("preserves the previous selection when it remains displayed", () => {
    const previous = emptyPreviousState();
    previous.selectedProjectId = "repo-1";
    previous.selectedWorkspaceId = "ws-1";

    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace()],
      organizationId: "org-1",
      previousState: previous,
    });

    expect(result.selectedProjectId).toBe("repo-1");
    expect(result.selectedWorkspaceId).toBe("ws-1");
  });

  it("resolves display project ids from org preferences when present", () => {
    const previous = emptyPreviousState();
    previous.organizationPreferencesById = {
      "org-1": {
        displayProjectIds: ["repo-1"],
        knownProjectIds: ["repo-1"],
        lastUsedExternalAppId: "vscode",
      },
    };

    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace()],
      organizationId: "org-1",
      previousState: previous,
    });

    expect(result.displayProjectIds).toEqual(["repo-1"]);
    expect(result.organizationPreferencesById?.["org-1"]?.lastUsedExternalAppId).toBe("vscode");
  });

  it("defaults all display ids to mapped projects when no preference exists", () => {
    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace()],
      organizationId: "org-1",
      previousState: emptyPreviousState(),
    });

    expect(result.displayProjectIds).toEqual(["repo-1"]);
  });

  it("maps a closed-status enum from the transport string", () => {
    const result = reconcile({
      projects: [buildProject()],
      workspacesFromApi: [buildWorkspace({ status: "active" as WorkspaceRecord["status"] })],
      organizationId: "org-1",
      previousState: emptyPreviousState(),
    });

    expect(result.workspaces[0]?.status).toBe("active" as WorkspaceStatus);
  });
});
