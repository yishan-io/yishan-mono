import type { AppDb } from "@/db/client";
import { ProjectService } from "@/services/project-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workspacePullRequestMocks = vi.hoisted(() => ({
  fetchLatestPrByWorkspaceId: vi.fn(),
}));

vi.mock("@/services/workspace-pull-request-service", () => ({
  fetchLatestPrByWorkspaceId: workspacePullRequestMocks.fetchLatestPrByWorkspaceId,
}));

const PROJECT_ROW = {
  id: "proj-1",
  name: "Project 1",
  sourceType: "git" as const,
  repoProvider: "github",
  repoUrl: "https://github.com/acme/project-1.git",
  repoKey: "acme/project-1",
  icon: "folder",
  color: "#111111",
  setupScript: "",
  postScript: "",
  commands: [],
  contextEnabled: true,
  organizationId: "org-1",
  createdByUserId: "user-1",
  createdAt: new Date("2026-06-28T00:00:00Z"),
  updatedAt: new Date("2026-06-28T00:00:00Z"),
};

function makeOrgService(role: string | null = "member") {
  // biome-ignore lint/suspicious/noExplicitAny: stub
  return { getMembershipRole: vi.fn().mockResolvedValue(role) } as any;
}

function makeListProjectsDb(workspaceRows: unknown[]) {
  let selectCall = 0;
  const where = vi.fn().mockImplementation(() => {
    selectCall += 1;
    if (selectCall === 1) {
      return Promise.resolve([PROJECT_ROW]);
    }
    return Promise.resolve(workspaceRows);
  });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select } as unknown as AppDb;
}

describe("ProjectService.listProjects", () => {
  beforeEach(() => {
    workspacePullRequestMocks.fetchLatestPrByWorkspaceId.mockReset();
    workspacePullRequestMocks.fetchLatestPrByWorkspaceId.mockResolvedValue(new Map());
  });

  it("includes provisioning workspaces when hydrating projects", async () => {
    const provisioningWorkspace = {
      id: "ws-1",
      organizationId: "org-1",
      projectId: "proj-1",
      userId: "user-1",
      nodeId: "node-1",
      kind: "worktree" as const,
      status: "provisioning" as const,
      branch: "feature-a",
      sourceBranch: "main",
      localPath: "",
      createdAt: new Date("2026-06-28T00:00:00Z"),
      updatedAt: new Date("2026-06-28T00:00:00Z"),
    };
    const service = new ProjectService(makeListProjectsDb([provisioningWorkspace]), makeOrgService("member"));

    const result = await service.listProjects({
      organizationId: "org-1",
      actorUserId: "user-1",
      withWorkspaces: true,
    });

    expect(result).toEqual([
      {
        ...PROJECT_ROW,
        workspaces: [{ ...provisioningWorkspace, latestPullRequest: null }],
      },
    ]);
    expect(workspacePullRequestMocks.fetchLatestPrByWorkspaceId).toHaveBeenCalledWith(expect.anything(), "org-1", [
      "ws-1",
    ]);
  });
});
