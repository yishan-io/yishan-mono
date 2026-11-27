import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn<(method: string, params?: unknown) => Promise<unknown>>());
vi.mock("@renderer/rpc", () => ({ request }));

import {
  getOverviewModelBreakdown,
  getOverviewTokenUsage,
  getOverviewWorkspaceInsights,
} from "./overviewDaemonProcedures";

const seriesItem = {
  bucketStartUtc: "2026-11-20T00:00:00Z",
  totalTokens: 10,
  inputTokens: 4,
  outputTokens: 3,
  cachedInputTokens: 2,
  cachedWriteTokens: 1,
  turnCount: 1,
  toolCallCount: 2,
  totalCostUsd: 0.5,
};

const tokenUsage = {
  series: [seriesItem],
  cachedTotal: 2,
  cachedWriteTotal: 1,
  uncachedTotal: 7,
  grandTotal: 10,
  turnTotal: 1,
  toolCallTotal: 2,
  totalCostUsd: 0.5,
};

const insights = {
  closedWorkspaceCount: 1,
  averageLifetimeHours: null,
  lastClosedWorkspaces: [
    {
      id: "w1",
      projectId: "p1",
      projectName: "p1",
      branch: null,
      createdAt: "2026-11-19T00:00:00Z",
      closedAt: "2026-11-20T00:00:00Z",
      lifetimeHours: 24,
      totalTokens: 5,
      totalCostUsd: 0,
    },
  ],
  primaryWorkspaceCount: 0,
  primaryWorkspaceTokens: 0,
  topPrimaryWorkspaces: [],
};

describe("overview daemon procedures", () => {
  beforeEach(() => request.mockReset());

  it("sends the overview scope and omits empty project/organization ids", async () => {
    request.mockResolvedValue(tokenUsage);

    await expect(
      getOverviewTokenUsage({ range: "30d", projectId: "", organizationId: "org-1", granularity: "hour" }),
    ).resolves.toEqual(tokenUsage);
    expect(request).toHaveBeenCalledWith("overview.tokenUsage", {
      range: "30d",
      organizationId: "org-1",
      granularity: "hour",
    });
  });

  it("parses model breakdown and workspace insights", async () => {
    const model = {
      modelNormalized: "opus",
      agentKind: "claude",
      totalTokens: 1,
      inputTokens: 1,
      outputTokens: 0,
      totalCostUsd: 0,
      percentage: 100,
    };
    request.mockImplementation(async (method: string) =>
      method === "overview.modelBreakdown" ? { models: [model] } : insights,
    );

    await expect(getOverviewModelBreakdown({ range: "7d" })).resolves.toEqual({ models: [model] });
    await expect(getOverviewWorkspaceInsights({ range: "7d", projectId: "p1" })).resolves.toEqual(insights);
    expect(request).toHaveBeenLastCalledWith("overview.workspaceInsights", { range: "7d", projectId: "p1" });
  });

  it.each([
    ["missing series", { ...tokenUsage, series: undefined }],
    ["non-numeric total", { ...tokenUsage, grandTotal: "10" }],
    ["malformed bucket", { ...tokenUsage, series: [{ ...seriesItem, totalCostUsd: Number.NaN }] }],
    ["null payload", null],
  ])("rejects a token usage payload with %s", async (_label, payload) => {
    request.mockResolvedValue(payload);
    await expect(getOverviewTokenUsage({ range: "7d", granularity: "day" })).rejects.toThrow(TypeError);
  });

  it("rejects workspace insights with a malformed item", async () => {
    const payload = { ...insights, topPrimaryWorkspaces: [{ id: "w2" }] };
    request.mockResolvedValue(payload);
    await expect(getOverviewWorkspaceInsights({ range: "7d" })).rejects.toThrow(/projectId/);
  });
});
