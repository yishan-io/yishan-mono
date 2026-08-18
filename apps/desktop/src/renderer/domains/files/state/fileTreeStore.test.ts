// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { fileTreeStore } from "./fileTreeStore";

const initialState = fileTreeStore.getState();

afterEach(() => {
  fileTreeStore.setState(initialState, true);
});

describe("fileTreeStore file-tree refresh signals", () => {
  it("increments the refresh version and records changed relative paths", () => {
    fileTreeStore.getState().incrementFileTreeRefreshVersion("/tmp/repo-1/.worktrees/feature-a", ["src/app.ts"]);

    const state = fileTreeStore.getState();
    expect(state.fileTreeRefreshVersion).toBe(1);
    expect(state.fileTreeChangedRelativePathsByWorktreePath).toEqual({
      "/tmp/repo-1/.worktrees/feature-a": ["src/app.ts"],
    });
  });

  it("ignores git internals when recording changed file-tree paths", () => {
    fileTreeStore
      .getState()
      .incrementFileTreeRefreshVersion("/tmp/repo-1/.worktrees/feature-a", [".git/worktrees/feature-a", "src/app.ts"]);

    expect(fileTreeStore.getState().fileTreeChangedRelativePathsByWorktreePath).toEqual({
      "/tmp/repo-1/.worktrees/feature-a": ["src/app.ts"],
    });
  });

  it("does nothing when the worktree path is empty", () => {
    fileTreeStore.getState().incrementFileTreeRefreshVersion("", ["src/app.ts"]);

    expect(fileTreeStore.getState().fileTreeRefreshVersion).toBe(0);
    expect(fileTreeStore.getState().fileTreeChangedRelativePathsByWorktreePath).toEqual({});
  });
});
