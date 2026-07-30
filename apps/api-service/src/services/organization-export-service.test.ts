import { nodes, projects, tokenUsageHourly, workspaces } from "@/db/schema";
import { OrganizationExportService } from "@/services/organization-export-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";

vi.mock("@/services/shared/assertOrganizationMember", () => ({
  assertOrganizationMember: vi.fn().mockResolvedValue(undefined),
}));

function createMockDb() {
  const mockWhere = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    db: { select: mockSelect } as any,
    mockSelect,
    mockFrom,
    mockWhere,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: mock organization service for unit testing
const stubOrganizationService = {} as any;

describe("OrganizationExportService", () => {
  let mock: ReturnType<typeof createMockDb>;
  let service: OrganizationExportService;

  beforeEach(() => {
    mock = createMockDb();
    service = new OrganizationExportService(mock.db, stubOrganizationService);
    vi.restoreAllMocks();
  });

  it("exports only projects reachable from actor-owned nodes", async () => {
    mock.mockWhere
      .mockResolvedValueOnce([{ id: "node-1" }])
      .mockResolvedValueOnce([{ id: "workspace-1", projectId: "project-1" }])
      .mockResolvedValueOnce([
        {
          id: "project-1",
          name: "Core, App",
          sourceType: "git",
          repoProvider: "github",
          repoUrl: "https://github.com/acme/core",
          repoKey: "acme/core",
          icon: "folder",
          color: "#1E66F5",
          setupScript: 'echo "hello"',
          postScript: "",
          commands: [{ name: "dev", command: "bun run dev" }],
          contextEnabled: true,
          organizationId: "org-1",
          createdByUserId: "user-1",
          createdAt: new Date("2026-07-31T10:00:00.000Z"),
          updatedAt: new Date("2026-07-31T11:00:00.000Z"),
        },
      ]);

    const result = await service.exportProjectsCsv({
      organizationId: "org-1",
      actorUserId: "user-1",
    });

    expect(assertOrganizationMember).toHaveBeenCalledWith(stubOrganizationService, "org-1", "user-1", undefined);
    expect(mock.mockSelect).toHaveBeenCalledTimes(3);
    expect(mock.mockFrom.mock.calls).toEqual([[nodes], [workspaces], [projects]]);
    expect(result.fileName).toBe("organization-org-1-projects.csv");
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(result.body).toBe(
      [
        "id,name,sourceType,repoProvider,repoUrl,repoKey,icon,color,setupScript,postScript,commands,contextEnabled,organizationId,createdByUserId,createdAt,updatedAt",
        'project-1,"Core, App",git,github,https://github.com/acme/core,acme/core,folder,#1E66F5,"echo ""hello""",,"[{""name"":""dev"",""command"":""bun run dev""}]",true,org-1,user-1,2026-07-31T10:00:00.000Z,2026-07-31T11:00:00.000Z',
      ].join("\n"),
    );
  });

  it("exports only workspaces on actor-owned nodes", async () => {
    mock.mockWhere.mockResolvedValueOnce([{ id: "node-1" }]).mockResolvedValueOnce([
      {
        id: "workspace-1",
        organizationId: "org-1",
        projectId: "project-1",
        userId: "user-1",
        nodeId: "node-1",
        kind: "primary",
        status: "active",
        branch: null,
        sourceBranch: "main",
        localPath: "/tmp/core",
        createdAt: new Date("2026-07-31T10:00:00.000Z"),
        updatedAt: new Date("2026-07-31T11:00:00.000Z"),
      },
    ]);

    const result = await service.exportWorkspacesCsv({
      organizationId: "org-1",
      actorUserId: "user-1",
    });

    expect(mock.mockSelect).toHaveBeenCalledTimes(2);
    expect(mock.mockFrom.mock.calls).toEqual([[nodes], [workspaces]]);
    expect(result.body).toBe(
      [
        "id,organizationId,projectId,userId,nodeId,kind,status,branch,sourceBranch,localPath,createdAt,updatedAt",
        "workspace-1,org-1,project-1,user-1,node-1,primary,active,,main,/tmp/core,2026-07-31T10:00:00.000Z,2026-07-31T11:00:00.000Z",
      ].join("\n"),
    );
  });

  it("exports only token usage rows for workspaces on actor-owned nodes", async () => {
    mock.mockWhere
      .mockResolvedValueOnce([{ id: "node-1" }])
      .mockResolvedValueOnce([{ id: "workspace-1", projectId: "project-1" }])
      .mockResolvedValueOnce([
        {
          id: "usage-1",
          organizationId: "org-1",
          projectId: "project-1",
          workspaceId: "workspace-1",
          workspacePath: "/tmp/core",
          agentKind: "opencode",
          model: "gpt-5",
          modelNormalized: "gpt-5",
          bucketStartHourUtc: new Date("2026-07-31T10:00:00.000Z"),
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 2,
          cachedWriteTokens: 1,
          reasoningTokens: 3,
          totalTokens: 21,
          eventCount: 4,
          sessionCount: 2,
          turnCount: 6,
          toolCallCount: 7,
          attributionConfidence: "exact",
          ingestedAt: new Date("2026-07-31T10:30:00.000Z"),
          runId: "run-1",
          createdAt: new Date("2026-07-31T10:31:00.000Z"),
          updatedAt: new Date("2026-07-31T10:32:00.000Z"),
        },
      ]);

    const result = await service.exportTokenUsageHourlyCsv({
      organizationId: "org-1",
      actorUserId: "user-1",
    });

    expect(mock.mockSelect).toHaveBeenCalledTimes(3);
    expect(mock.mockFrom.mock.calls).toEqual([[nodes], [workspaces], [tokenUsageHourly]]);
    expect(result.body).toBe(
      [
        "id,organizationId,projectId,workspaceId,workspacePath,agentKind,model,modelNormalized,bucketStartHourUtc,inputTokens,outputTokens,cachedInputTokens,cachedWriteTokens,reasoningTokens,totalTokens,eventCount,sessionCount,turnCount,toolCallCount,attributionConfidence,ingestedAt,runId,createdAt,updatedAt",
        "usage-1,org-1,project-1,workspace-1,/tmp/core,opencode,gpt-5,gpt-5,2026-07-31T10:00:00.000Z,10,5,2,1,3,21,4,2,6,7,exact,2026-07-31T10:30:00.000Z,run-1,2026-07-31T10:31:00.000Z,2026-07-31T10:32:00.000Z",
      ].join("\n"),
    );
  });

  it("returns header-only CSV when the actor owns no nodes", async () => {
    mock.mockWhere.mockResolvedValueOnce([]);

    const result = await service.exportWorkspacesCsv({
      organizationId: "org-1",
      actorUserId: "user-1",
    });

    expect(mock.mockSelect).toHaveBeenCalledTimes(1);
    expect(result.body).toBe(
      "id,organizationId,projectId,userId,nodeId,kind,status,branch,sourceBranch,localPath,createdAt,updatedAt",
    );
  });
});
