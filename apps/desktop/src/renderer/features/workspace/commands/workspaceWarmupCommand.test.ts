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
});
