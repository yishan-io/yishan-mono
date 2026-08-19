import { describe, expect, it } from "vitest";
import { buildWorkspaceCreatePlaceholder } from "./workspaceCreatePlaceholder";

describe("buildWorkspaceCreatePlaceholder (moves to features/create-workspace after P30)", () => {
  it("builds a complete optimistic workspace row", () => {
    const placeholder = buildWorkspaceCreatePlaceholder({
      organizationId: "org-1",
      projectId: "repo-1",
      repoId: "repo-1",
      name: "My Workspace",
      sourceBranch: "main",
      branch: "feature/x",
      worktreePath: "/worktrees/feature-x",
      nodeId: "node-1",
      workspaceId: "ws-new",
      status: "provisioning",
      preserveOnMissingSnapshot: true,
    });

    expect(placeholder).toEqual({
      organizationId: "org-1",
      projectId: "repo-1",
      repoId: "repo-1",
      name: "My Workspace",
      sourceBranch: "main",
      branch: "feature/x",
      worktreePath: "/worktrees/feature-x",
      nodeId: "node-1",
      workspaceId: "ws-new",
      status: "provisioning",
      preserveOnMissingSnapshot: true,
    });
  });

  it("defaults repoId to projectId when absent", () => {
    const placeholder = buildWorkspaceCreatePlaceholder({
      projectId: "repo-9",
      name: "W",
      sourceBranch: "main",
      branch: "main",
      workspaceId: "ws-new",
    });

    expect(placeholder.repoId).toBe("repo-9");
  });

  it("defaults worktreePath to empty when absent", () => {
    const placeholder = buildWorkspaceCreatePlaceholder({
      projectId: "repo-9",
      name: "W",
      sourceBranch: "main",
      branch: "main",
      workspaceId: "ws-new",
    });

    expect(placeholder.worktreePath).toBe("");
  });

  it("keeps the provided status when present", () => {
    const placeholder = buildWorkspaceCreatePlaceholder({
      projectId: "repo-9",
      name: "W",
      sourceBranch: "main",
      branch: "main",
      workspaceId: "ws-new",
      status: "active",
    });

    expect(placeholder.status).toBe("active");
  });
});
