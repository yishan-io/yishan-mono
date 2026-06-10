import { tokenUsageHourly, workspaces } from "@/db/schema";
import { TokenUsageService } from "@/services/token-usage-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/shared/assertOrganizationMember", () => ({
  assertOrganizationMember: vi.fn().mockResolvedValue(undefined),
}));

function createMockDb() {
  const mockWhereSelect = vi.fn();
  const mockFromSelect = vi.fn().mockReturnValue({ where: mockWhereSelect });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFromSelect });

  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  return {
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    db: { select: mockSelect, insert: mockInsert } as any,
    mockSelect,
    mockFromSelect,
    mockWhereSelect,
    mockInsert,
    mockValues,
    mockOnConflictDoUpdate,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: mock organization service for unit testing
const stubOrganizationService = {} as any;

function buildRow(overrides?: Partial<Parameters<TokenUsageService["upsertHourly"]>[0]["rows"][number]>) {
  return {
    projectId: "project-1",
    workspaceId: "workspace-1",
    workspacePath: "/tmp/workspace-1",
    agentKind: "opencode" as const,
    model: "deepseek/deepseek-v4-pro",
    modelNormalized: "deepseek/deepseek-v4-pro",
    bucketStartHourUtc: "2026-06-10T09:00:00.000Z",
    inputTokens: 10,
    outputTokens: 5,
    cachedInputTokens: 3,
    cachedWriteTokens: 2,
    reasoningTokens: 1,
    totalTokens: 21,
    eventCount: 1,
    sessionCount: 1,
    attributionConfidence: "exact" as const,
    ingestedAt: "2026-06-10T09:29:26.894Z",
    runId: "daemon-opencode",
    ...overrides,
  };
}

describe("TokenUsageService", () => {
  let mock: ReturnType<typeof createMockDb>;
  let service: TokenUsageService;

  beforeEach(() => {
    mock = createMockDb();
    service = new TokenUsageService(mock.db, stubOrganizationService);
    vi.restoreAllMocks();
  });

  it("skips rows when the workspace does not exist", async () => {
    mock.mockWhereSelect.mockResolvedValue([]);

    const result = await service.upsertHourly({
      organizationId: "org-1",
      actorUserId: "user-1",
      rows: [buildRow()],
    });

    expect(mock.mockSelect).toHaveBeenCalled();
    expect(mock.mockFromSelect).toHaveBeenCalledWith(workspaces);
    expect(mock.mockInsert).not.toHaveBeenCalled();
    expect(result).toEqual({ upserted: 0 });
  });

  it("inserts only rows whose workspace exists in the same project", async () => {
    mock.mockWhereSelect.mockResolvedValue([{ id: "workspace-1", projectId: "project-1" }]);

    const result = await service.upsertHourly({
      organizationId: "org-1",
      actorUserId: "user-1",
      rows: [buildRow(), buildRow({ workspaceId: "workspace-2", projectId: "project-2" })],
    });

    expect(mock.mockInsert).toHaveBeenCalledWith(tokenUsageHourly);
    expect(mock.mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        organizationId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      }),
    ]);
    expect(mock.mockOnConflictDoUpdate).toHaveBeenCalled();
    expect(result).toEqual({ upserted: 1 });
  });
});
