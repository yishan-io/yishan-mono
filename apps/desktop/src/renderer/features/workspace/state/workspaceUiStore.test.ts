// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { workspaceUiStore } from "./workspaceUiStore";

const initialState = workspaceUiStore.getState();

afterEach(() => {
  workspaceUiStore.setState(initialState, true);
});

describe("workspaceUiStore file-tree refresh signals", () => {
  it("increments the refresh version and records changed relative paths", () => {
    workspaceUiStore.getState().incrementFileTreeRefreshVersion("/tmp/repo-1/.worktrees/feature-a", ["src/app.ts"]);

    const state = workspaceUiStore.getState();
    expect(state.fileTreeRefreshVersion).toBe(1);
    expect(state.fileTreeChangedRelativePathsByWorktreePath).toEqual({
      "/tmp/repo-1/.worktrees/feature-a": ["src/app.ts"],
    });
  });

  it("ignores git internals when recording changed file-tree paths", () => {
    workspaceUiStore
      .getState()
      .incrementFileTreeRefreshVersion("/tmp/repo-1/.worktrees/feature-a", [".git/worktrees/feature-a", "src/app.ts"]);

    expect(workspaceUiStore.getState().fileTreeChangedRelativePathsByWorktreePath).toEqual({
      "/tmp/repo-1/.worktrees/feature-a": ["src/app.ts"],
    });
  });

  it("does nothing when the worktree path is empty", () => {
    workspaceUiStore.getState().incrementFileTreeRefreshVersion("", ["src/app.ts"]);

    expect(workspaceUiStore.getState().fileTreeRefreshVersion).toBe(0);
    expect(workspaceUiStore.getState().fileTreeChangedRelativePathsByWorktreePath).toEqual({});
  });
});
