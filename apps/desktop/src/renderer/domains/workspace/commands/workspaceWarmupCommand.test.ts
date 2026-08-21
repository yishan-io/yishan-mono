// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildWorkspaceOpenProjectEntries } from "./workspaceWarmupCommand";

describe("buildWorkspaceOpenProjectEntries", () => {
  it("excludes error workspaces from open-project warmup so error state is not clobbered", () => {
    const entries = buildWorkspaceOpenProjectEntries(
      [
        { id: "ws-ok", projectId: "project-1", worktreePath: "/tmp/ok" },
        { id: "ws-broken", projectId: "project-1", worktreePath: "/tmp/broken", state: "error" },
      ],
      "org-1",
    );
    expect(entries).toEqual([
      { workspaceId: "ws-ok", worktreePath: "/tmp/ok", projectId: "project-1", orgId: "org-1" },
    ]);
  });

  it("forwards folder kind without adding a kind to normal workspace entries", () => {
    const entries = buildWorkspaceOpenProjectEntries(
      [
        { id: "ws-folder", projectId: "local-folder", worktreePath: "/tmp/folder", kind: "folder" },
        { id: "ws-normal", projectId: "project-1", worktreePath: "/tmp/project", kind: "managed" },
      ],
      "org-1",
    );

    expect(entries).toEqual([
      {
        workspaceId: "ws-folder",
        worktreePath: "/tmp/folder",
        projectId: "local-folder",
        orgId: "org-1",
        kind: "folder",
      },
      {
        workspaceId: "ws-normal",
        worktreePath: "/tmp/project",
        projectId: "project-1",
        orgId: "org-1",
      },
    ]);
  });
});
