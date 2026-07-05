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

  const resolveResult = (state: {
    fromTable: unknown;
    whereCondition: unknown;
    selectedFields: Record<string, unknown>;
  }) => {
    if (state.fromTable === tokenUsageHourly && "totalTokens" in state.selectedFields) {
      if (conditionUsesColumn(state.whereCondition, "workspace_path")) {
        if (conditionContainsValue(state.whereCondition, "/repos/yishan")) {
          return [{ totalTokens: 125 }];
        }
        if (conditionContainsValue(state.whereCondition, "/repos/other")) {
          return [{ totalTokens: 7 }];
        }
      }
      return [{ totalTokens: 0 }];
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
    // biome-ignore lint/suspicious/noExplicitAny: unit-test DB mock
    db: { select: mockSelect } as any,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: unit-test service stub
const stubOrganizationService = {} as any;

describe("OverviewService.getWorkspaceInsights", () => {
  let mock: ReturnType<typeof createMockDb>;
  let service: OverviewService;

  beforeEach(() => {
    mock = createMockDb();
    service = new OverviewService(mock.db, stubOrganizationService);
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
      expect.objectContaining({ id: "ws-current", projectName: "Yishan", totalTokens: 125 }),
      expect.objectContaining({ id: "ws-other", projectName: "Other", totalTokens: 7 }),
    ]);
  });
});
