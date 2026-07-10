import { describe, expect, it, vi } from "vitest";

import type { Workspace } from "@/features/workspaces/workspaces.types";
import {
  shouldHandleWorkspaceCreateEvent,
  syncPendingWorkspaceCreateId,
  waitForCreatedWorkspace,
} from "./workspace-create-submit-domain";

function createWorkspace(id: string): Workspace {
  return {
    id,
    organizationId: "org-1",
    projectId: "project-1",
    userId: "user-1",
    nodeId: "node-1",
    kind: "worktree",
    status: "active",
    branch: "feature/mobile",
    sourceBranch: "origin/main",
    localPath: `/tmp/${id}`,
    latestPullRequest: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  };
}

describe("workspace-create-submit-domain", () => {
  it("matches started events by stable create metadata before the authoritative workspace id is known", () => {
    expect(
      shouldHandleWorkspaceCreateEvent({
        currentCreate: {
          branch: "feature/mobile",
          nodeId: "node-1",
          requestedWorkspaceId: "workspace-requested-1",
          sourceBranch: "origin/main",
          workspaceId: "workspace-requested-1",
          workspaceName: "feature-mobile",
        },
        event: {
          type: "started",
          workspaceId: "workspace-api-1",
          organizationId: "org-1",
          projectId: "project-1",
          workspaceName: "feature-mobile",
          sourceBranch: "origin/main",
          branch: "feature/mobile",
          nodeId: "node-1",
        },
      }),
    ).toBe(true);
  });

  it("does not match unrelated create events", () => {
    expect(
      shouldHandleWorkspaceCreateEvent({
        currentCreate: {
          branch: "feature/mobile",
          nodeId: "node-1",
          requestedWorkspaceId: "workspace-requested-1",
          sourceBranch: "origin/main",
          workspaceId: "workspace-requested-1",
          workspaceName: "feature-mobile",
        },
        event: {
          type: "progress",
          workspaceId: "workspace-other",
          stepId: "clone",
          label: "Clone repository",
          status: "running",
          createdAt: "2026-06-30T00:00:00.000Z",
        },
      }),
    ).toBe(false);
  });

  it("switches tracking to the authoritative workspace id once it is known", () => {
    expect(
      syncPendingWorkspaceCreateId({
        currentCreate: {
          branch: "feature/mobile",
          nodeId: "node-1",
          requestedWorkspaceId: "workspace-requested-1",
          sourceBranch: "origin/main",
          workspaceId: "workspace-requested-1",
          workspaceName: "feature-mobile",
        },
        workspaceId: " workspace-api-1 ",
      }),
    ).toMatchObject({
      requestedWorkspaceId: "workspace-requested-1",
      workspaceId: "workspace-api-1",
    });
  });

  it("retries until the created workspace becomes visible", async () => {
    const loadWorkspaces = vi
      .fn<() => Promise<Workspace[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createWorkspace("workspace-1")]);

    await expect(
      waitForCreatedWorkspace({
        delayMs: 0,
        loadWorkspaces,
        maxAttempts: 4,
        workspaceId: "workspace-1",
      }),
    ).resolves.toMatchObject({
      id: "workspace-1",
    });

    expect(loadWorkspaces).toHaveBeenCalledTimes(3);
  });

  it("fails after the retry budget is exhausted", async () => {
    const loadWorkspaces = vi.fn<() => Promise<Workspace[]>>().mockResolvedValue([]);

    await expect(
      waitForCreatedWorkspace({
        delayMs: 0,
        loadWorkspaces,
        maxAttempts: 3,
        workspaceId: "workspace-1",
      }),
    ).rejects.toThrow("Workspace was created, but mobile could not refresh it yet.");

    expect(loadWorkspaces).toHaveBeenCalledTimes(3);
  });
});
