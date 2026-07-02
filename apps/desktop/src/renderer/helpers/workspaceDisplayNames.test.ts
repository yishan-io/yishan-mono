import { describe, expect, it } from "vitest";
import {
  LOCAL_WORKSPACE_DISPLAY_NAME,
  resolveExplicitWorkspaceDisplayMetadata,
  resolveHydratedWorkspaceDisplayMetadata,
  resolveWorkspaceListDisplayName,
} from "./workspaceDisplayNames";

describe("workspaceDisplayNames", () => {
  it("maps primary workspaces to local display metadata", () => {
    expect(
      resolveHydratedWorkspaceDisplayMetadata({
        kind: "primary",
        branch: "main",
        localPath: "/tmp/repo",
      }),
    ).toEqual({
      name: LOCAL_WORKSPACE_DISPLAY_NAME,
      title: LOCAL_WORKSPACE_DISPLAY_NAME,
    });
  });

  it("uses branch until a hydrated managed workspace has a local path basename", () => {
    expect(
      resolveHydratedWorkspaceDisplayMetadata({
        kind: "worktree",
        branch: "branch-prefix/abcss",
        localPath: "",
      }),
    ).toEqual({
      name: "branch-prefix/abcss",
      title: "branch-prefix/abcss",
    });

    expect(
      resolveHydratedWorkspaceDisplayMetadata({
        kind: "worktree",
        branch: "branch-prefix/abcss",
        localPath: "/tmp/repo/.worktrees/abcss",
      }),
    ).toEqual({
      name: "branch-prefix/abcss",
      title: "abcss",
    });
  });

  it("uses explicit names for optimistic workspace rows", () => {
    expect(resolveExplicitWorkspaceDisplayMetadata("  abcss  ")).toEqual({
      name: "abcss",
      title: "abcss",
    });
  });

  it("uses local for left-pane rows that alias the project path", () => {
    expect(
      resolveWorkspaceListDisplayName(
        {
          id: "workspace-1",
          kind: "managed",
          title: "feature-a",
        },
        "workspace-1",
      ),
    ).toBe(LOCAL_WORKSPACE_DISPLAY_NAME);
  });
});
