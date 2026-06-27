import { describe, expect, it } from "vitest";

import {
  buildWorkspaceLiveQueryInvalidationPlan,
  isWorkspaceReadQueryKey,
} from "./workspace-live-query-invalidation-domain";

const scope = {
  organizationId: "org-1",
  projectId: "project-1",
  workspaceId: "workspace-1",
};

describe("workspace-live-query-invalidation-domain", () => {
  it("invalidates workspace read queries for workspaceFilesChanged on the current workspace", () => {
    expect(
      buildWorkspaceLiveQueryInvalidationPlan({
        message: {
          payload: {
            changedRelativePaths: ["src/app.ts", "src"],
            workspaceId: "workspace-1",
          },
          topic: "workspaceFilesChanged",
          type: "event",
        },
        scope,
      }),
    ).toEqual({
      changedRelativePaths: ["src/app.ts", "src"],
      invalidateProjectLists: false,
      invalidateWorkspaceLists: false,
      invalidateWorkspaceReadQueries: true,
      topic: "workspaceFilesChanged",
    });
  });

  it("ignores workspaceFilesChanged for a different workspace", () => {
    expect(
      buildWorkspaceLiveQueryInvalidationPlan({
        message: {
          payload: {
            changedRelativePaths: ["src/app.ts"],
            workspaceId: "workspace-2",
          },
          topic: "workspaceFilesChanged",
          type: "event",
        },
        scope,
      }),
    ).toBeNull();
  });

  it("invalidates project and workspace lists for workspace snapshot changes in the current project", () => {
    expect(
      buildWorkspaceLiveQueryInvalidationPlan({
        message: {
          payload: {
            change: "closed",
            organizationId: "org-1",
            projectId: "project-1",
            resource: "workspace",
            workspaceId: "workspace-1",
          },
          topic: "workspaceSnapshotChanged",
          type: "event",
        },
        scope,
      }),
    ).toEqual({
      change: "closed",
      invalidateProjectLists: true,
      invalidateWorkspaceLists: true,
      invalidateWorkspaceReadQueries: true,
      resource: "workspace",
      topic: "workspaceSnapshotChanged",
    });
  });

  it("ignores workspace snapshot changes from another project", () => {
    expect(
      buildWorkspaceLiveQueryInvalidationPlan({
        message: {
          payload: {
            change: "updated",
            organizationId: "org-1",
            projectId: "project-2",
            resource: "workspace",
            workspaceId: "workspace-2",
          },
          topic: "workspaceSnapshotChanged",
          type: "event",
        },
        scope,
      }),
    ).toBeNull();
  });

  it("matches workspace browser read query keys for the current workspace", () => {
    expect(
      isWorkspaceReadQueryKey(
        ["organizations", "org-1", "projects", "project-1", "workspaces", "workspace-1", "files", "", false],
        scope,
      ),
    ).toBe(true);
    expect(
      isWorkspaceReadQueryKey(
        ["organizations", "org-1", "projects", "project-1", "workspaces", "workspace-1", "pull-requests"],
        scope,
      ),
    ).toBe(false);
    expect(
      isWorkspaceReadQueryKey(
        ["organizations", "org-1", "projects", "project-1", "workspaces", "workspace-2", "files", "", false],
        scope,
      ),
    ).toBe(false);
  });
});
