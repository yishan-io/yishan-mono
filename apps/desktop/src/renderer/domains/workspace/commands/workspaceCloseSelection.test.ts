import { describe, expect, it } from "vitest";
import type { WorkspaceItem } from "../workspaceTypes";
import { resolveWorkspaceAfterClose } from "./workspaceCloseSelection";

function createWorkspace(id: string): WorkspaceItem {
  return {
    id,
    repoId: `project-${id}`,
    name: `Workspace ${id}`,
    title: `Workspace ${id}`,
    sourceBranch: "main",
    branch: id,
    summaryId: id,
  };
}

describe("resolveWorkspaceAfterClose", () => {
  const workspaceA = createWorkspace("workspace-a");
  const workspaceB = createWorkspace("workspace-b");
  const workspaceC = createWorkspace("workspace-c");

  it("selects the navigator-order predecessor of the closing workspace", () => {
    expect(
      resolveWorkspaceAfterClose({
        closingWorkspaceId: workspaceB.id,
        orderedWorkspaceIds: [workspaceC.id, workspaceB.id, workspaceA.id],
        preCloseWorkspaces: [workspaceA, workspaceB, workspaceC],
      }),
    ).toBe(workspaceC);
  });

  it("selects the navigator-order successor when the closing workspace has no predecessor", () => {
    expect(
      resolveWorkspaceAfterClose({
        closingWorkspaceId: workspaceA.id,
        orderedWorkspaceIds: [workspaceA.id, workspaceC.id, workspaceB.id],
        preCloseWorkspaces: [workspaceA, workspaceB, workspaceC],
      }),
    ).toBe(workspaceC);
  });

  it("uses only navigator order when it contains the closing workspace", () => {
    expect(
      resolveWorkspaceAfterClose({
        closingWorkspaceId: workspaceB.id,
        orderedWorkspaceIds: [workspaceB.id],
        preCloseWorkspaces: [workspaceA, workspaceB, workspaceC],
      }),
    ).toBeUndefined();
  });

  it("returns undefined when closing the only workspace", () => {
    expect(
      resolveWorkspaceAfterClose({
        closingWorkspaceId: workspaceA.id,
        orderedWorkspaceIds: [workspaceA.id],
        preCloseWorkspaces: [workspaceA],
      }),
    ).toBeUndefined();
  });

  it("falls back to pre-close workspace order when navigator order is missing or stale", () => {
    expect(
      resolveWorkspaceAfterClose({
        closingWorkspaceId: workspaceB.id,
        orderedWorkspaceIds: ["stale-workspace", workspaceA.id, workspaceC.id],
        preCloseWorkspaces: [workspaceA, workspaceB, workspaceC],
      }),
    ).toBe(workspaceA);
  });

  it("ignores a stale ID immediately before the closing workspace", () => {
    expect(
      resolveWorkspaceAfterClose({
        closingWorkspaceId: workspaceB.id,
        orderedWorkspaceIds: [workspaceA.id, "stale-workspace", workspaceB.id, workspaceC.id],
        preCloseWorkspaces: [workspaceA, workspaceB, workspaceC],
      }),
    ).toBe(workspaceA);
  });

  it("does not select a duplicate closing workspace as its successor", () => {
    expect(
      resolveWorkspaceAfterClose({
        closingWorkspaceId: workspaceB.id,
        orderedWorkspaceIds: [workspaceB.id, workspaceB.id, workspaceC.id],
        preCloseWorkspaces: [workspaceA, workspaceB, workspaceC],
      }),
    ).toBe(workspaceC);
  });
});
