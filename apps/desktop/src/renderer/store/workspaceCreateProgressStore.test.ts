import { afterEach, describe, expect, it } from "vitest";
import { workspaceCreateProgressStore } from "./workspaceCreateProgressStore";

const initialWorkspaceCreateProgressState = workspaceCreateProgressStore.getState();

afterEach(() => {
  workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressState, true);
});

describe("workspaceCreateProgressStore", () => {
  it("clears only hydrated active workspaces with a real worktree path", () => {
    workspaceCreateProgressStore.getState().startWorkspaceCreateProgress("workspace-active");
    workspaceCreateProgressStore.getState().startWorkspaceCreateProgress("workspace-provisioning");
    workspaceCreateProgressStore.getState().startWorkspaceCreateProgress("workspace-pathless");

    workspaceCreateProgressStore.getState().reconcileHydratedWorkspaceCreateProgress([
      { id: "workspace-active", status: "active", worktreePath: "/tmp/workspace-active" },
      { id: "workspace-provisioning", status: "provisioning", worktreePath: "/tmp/workspace-provisioning" },
      { id: "workspace-pathless", status: "active", worktreePath: "" },
    ]);

    const state = workspaceCreateProgressStore.getState();
    expect(state.progressByWorkspaceId["workspace-active"]).toBeUndefined();
    expect(state.progressByWorkspaceId["workspace-provisioning"]?.isComplete).toBe(false);
    expect(state.progressByWorkspaceId["workspace-pathless"]?.isComplete).toBe(false);
  });

  it("clears one tracked progress entry explicitly", () => {
    workspaceCreateProgressStore.getState().startWorkspaceCreateProgress("workspace-active");
    workspaceCreateProgressStore.getState().clearWorkspaceCreateProgress("workspace-active");

    expect(workspaceCreateProgressStore.getState().progressByWorkspaceId["workspace-active"]).toBeUndefined();
  });

  it("does not create new progress entries for hydrated workspaces that were never tracked", () => {
    workspaceCreateProgressStore
      .getState()
      .reconcileHydratedWorkspaceCreateProgress([
        { id: "workspace-active", status: "active", worktreePath: "/tmp/workspace-active" },
      ]);

    expect(workspaceCreateProgressStore.getState().progressByWorkspaceId["workspace-active"]).toBeUndefined();
  });
});
