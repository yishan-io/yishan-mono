import { tokenUsageHourly, workspaces } from "@/db/schema";
import { OverviewService } from "@/services/overview-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/shared/assertOrganizationMember", () => ({
  assertOrganizationMember: vi.fn().mockResolvedValue(undefined),
}));

function conditionContainsValue(condition: unknown, expectedValue: string, visited = new Set<unknown>()): boolean {
  if (condition == null) {
    return false;
  }
  if (typeof condition === "string") {
    return condition === expectedValue;
  }
  if (typeof condition !== "object") {
    return false;
  }
  if (visited.has(condition)) {
    return false;
  }
  visited.add(condition);
  if ("value" in condition && condition.value === expectedValue) {
    return true;
  }
  return Object.values(condition).some((value) => conditionContainsValue(value, expectedValue, visited));
}

function conditionUsesColumn(condition: unknown, expectedColumnName: string, visited = new Set<unknown>()): boolean {
  if (condition == null || typeof condition !== "object") {
    return false;
  }
  if (visited.has(condition)) {
    return false;
  }
  visited.add(condition);
  if ("name" in condition && condition.name === expectedColumnName) {
    return true;
  }
  return Object.values(condition).some((value) => conditionUsesColumn(value, expectedColumnName, visited));
}

function createMockDb() {
  const queuedResults: unknown[] = [];
  // defaultTokenRow is returned for token-usage SUM queries that are not
  // primary-workspace-path lookups (e.g. model breakdown, per-workspace token
  // sums). Tests can inject cost via setDefaultTokenRow.
  let defaultTokenRow: Record<string, unknown> = { totalTokens: 0, totalCostMicrosUsd: 0 };

  const resolveResult = (state: {
    fromTable: unknown;
    whereCondition: unknown;
    selectedFields: Record<string, unknown>;
  }) => {
    if (state.fromTable === tokenUsageHourly && "totalTokens" in state.selectedFields) {
      if (conditionUsesColumn(state.whereCondition, "workspace_path")) {
        if (conditionContainsValue(state.whereCondition, "/repos/yishan")) {
          return [{ totalTokens: 125, totalCostMicrosUsd: 250_000 }];
        }
        if (conditionContainsValue(state.whereCondition, "/repos/other")) {
          return [{ totalTokens: 7, totalCostMicrosUsd: 7_000 }];
        }
      }
      return [defaultTokenRow];
    }
    if (queuedResults.length === 0) {
      throw new Error("Mock result queue exhausted");
    }
    return queuedResults.shift();
  };

  const mockSelect = vi.fn().mockImplementation((selectedFields: Record<string, unknown>) => {
    const state = {
      fromTable: undefined as unknown,
      whereCondition: undefined as unknown,
      selectedFields,
    };
    const query = {
      from: vi.fn((fromTable: unknown) => {
        state.fromTable = fromTable;
        return query;
      }),
      innerJoin: vi.fn(() => query),
      where: vi.fn((whereCondition: unknown) => {
        state.whereCondition = whereCondition;
        return query;
      }),
      orderBy: vi.fn(() => query),
      groupBy: vi.fn(() => query),
      limit: vi.fn(() => query),
      // biome-ignore lint/suspicious/noThenProperty: query builder test double must be awaitable
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveResult(state)).then(onFulfilled, onRejected),
    };
    return query;
  });

  return {
    queuedResults,
    setDefaultTokenRow: (row: Record<string, unknown>) => {
      defaultTokenRow = row;
    },
    // biome-ignore lint/suspicious/noExplicitAny: unit-test DB mock
    db: { select: mockSelect, execute: vi.fn(async () => ({ rows: queuedResults.shift() ?? [] })) } as any,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: unit-test service stub
const stubOrganizationService = {} as any;

describe("OverviewService.getTokenUsage", () => {
  let mock: ReturnType<typeof createMockDb>;
  let service: OverviewService;

  beforeEach(() => {
    mock = createMockDb();
    service = new OverviewService(mock.db, stubOrganizationService);
  });

  it("aggregates cost per bucket and as a grand total (micros → usd)", async () => {
    mock.queuedResults.push([
      {
        bucket: new Date("2026-08-01T00:00:00Z"),
        total_tokens: 100,
        input_tokens: 80,
        output_tokens: 20,
        cached_input_tokens: 0,
        cached_write_tokens: 0,
        turn_count: 2,
        tool_call_count: 1,
        total_cost_micros_usd: 100_000,
      },
      {
        bucket: new Date("2026-08-02T00:00:00Z"),
        total_tokens: 50,
        input_tokens: 30,
        output_tokens: 20,
        cached_input_tokens: 0,
        cached_write_tokens: 0,
        turn_count: 1,
        tool_call_count: 0,
        total_cost_micros_usd: 50_000,
      },
    ]);

    const result = await service.getTokenUsage({
      organizationId: "org-1",
      actorUserId: "user-1",
      range: "7d",
      granularity: "day",
    });

    expect(result.series[0]!.totalCostUsd).toBe(0.1);
    expect(result.series[1]!.totalCostUsd).toBe(0.05);
    expect(result.totalCostUsd).toBeCloseTo(0.15, 10);
    expect(result.grandTotal).toBe(150);
  });
});

describe("OverviewService.getModelBreakdown", () => {
  let mock: ReturnType<typeof createMockDb>;
  let service: OverviewService;

  beforeEach(() => {
    mock = createMockDb();
    service = new OverviewService(mock.db, stubOrganizationService);
  });

  it("includes per-model cost (micros → usd)", async () => {
    mock.setDefaultTokenRow({
      modelNormalized: "gpt-4o",
      agentKind: "pi",
      totalTokens: 100,
      inputTokens: 80,
      outputTokens: 20,
      totalCostMicrosUsd: 200_000,
    });

    const result = await service.getModelBreakdown({
      organizationId: "org-1",
      actorUserId: "user-1",
      range: "7d",
    });

    expect(result.models[0]?.totalCostUsd).toBe(0.2);
    expect(result.models[0]?.totalTokens).toBe(100);
  });
});

describe("OverviewService.getWorkspaceInsights", () => {
  let mock: ReturnType<typeof createMockDb>;
  let service: OverviewService;

  beforeEach(() => {
    mock = createMockDb();
    service = new OverviewService(mock.db, stubOrganizationService);
  });

  it("includes cost for closed workspaces (micros → usd)", async () => {
    mock.setDefaultTokenRow({ totalTokens: 300, totalCostMicrosUsd: 500_000 });
    mock.queuedResults.push(
      [{ count: 1 }],
      [{ avgSeconds: 3600 }],
      [
        {
          id: "ws-c",
          projectId: "project-1",
          branch: "feat",
          createdAt: new Date("2026-08-01T00:00:00Z"),
          closedAt: new Date("2026-08-02T00:00:00Z"),
        },
      ],
      [{ name: "Yishan" }],
      [], // primary workspace rows — none
    );

    const result = await service.getWorkspaceInsights({
      organizationId: "org-1",
      actorUserId: "user-1",
      range: "7d",
    });

    expect(result.closedWorkspaceCount).toBe(1);
    expect(result.lastClosedWorkspaces[0]).toEqual(
      expect.objectContaining({ totalTokens: 300, totalCostUsd: 0.5 }),
    );
  });

  it("counts primary workspace usage by stable workspace path instead of only current workspace id", async () => {
    mock.queuedResults.push(
      [{ count: 0 }],
      [{ avgSeconds: null }],
      [],
      [
        {
          id: "ws-current",
          projectId: "project-yishan",
          branch: null,
          createdAt: new Date("2026-07-01T00:00:00Z"),
          localPath: "/repos/yishan",
        },
        {
          id: "ws-other",
          projectId: "project-other",
          branch: null,
          createdAt: new Date("2026-06-30T00:00:00Z"),
          localPath: "/repos/other",
        },
      ],
      [{ name: "Yishan" }],
      [{ name: "Other" }],
    );

    const result = await service.getWorkspaceInsights({
      organizationId: "org-1",
      actorUserId: "user-1",
      range: "7d",
    });

    expect(result.primaryWorkspaceCount).toBe(2);
    expect(result.primaryWorkspaceTokens).toBe(132);
    expect(result.topPrimaryWorkspaces).toEqual([
      expect.objectContaining({ id: "ws-current", projectName: "Yishan", totalTokens: 125, totalCostUsd: 0.25 }),
      expect.objectContaining({ id: "ws-other", projectName: "Other", totalTokens: 7, totalCostUsd: 0.007 }),
    ]);
  });
});
