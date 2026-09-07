// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFileTreeGitChanges } from "./useFileTreeGitChanges";

describe("useFileTreeGitChanges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not request Git changes for a non-active workspace", () => {
    const listGitChanges = vi.fn();

    renderHook(() =>
      useFileTreeGitChanges({
        listGitChanges,
        selectedWorkspaceId: "workspace-1",
        selectedWorkspaceWorktreePath: "/tmp/missing-worktree",
        workspaceGitRefreshVersion: 0,
        isWorkspaceActive: false,
      }),
    );

    expect(listGitChanges).not.toHaveBeenCalled();
  });
});
