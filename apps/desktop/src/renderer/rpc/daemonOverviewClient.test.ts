import { describe, expect, it, vi } from "vitest";

import { DaemonOverviewClient } from "./daemonOverviewClient";

describe("DaemonOverviewClient", () => {
  it("parses token-usage cost fields", async () => {
    const invoke = vi.fn(async () => ({
      series: [
        {
          bucketStartUtc: "2026-08-03T14:00:00Z",
          totalTokens: 1234,
          inputTokens: 1000,
          outputTokens: 234,
          cachedInputTokens: 100,
          cachedWriteTokens: 0,
          turnCount: 3,
          toolCallCount: 2,
          totalCostUsd: 0.5,
        },
      ],
      cachedTotal: 100,
      cachedWriteTotal: 0,
      uncachedTotal: 1134,
      grandTotal: 1234,
      turnTotal: 3,
      toolCallTotal: 2,
      totalCostUsd: 0.5,
    }));
    const client = new DaemonOverviewClient(invoke);

    const result = await client.getTokenUsage({ range: "7d", granularity: "day" });

    expect(result).toMatchObject({
      totalCostUsd: 0.5,
      series: [
        {
          totalCostUsd: 0.5,
        },
      ],
    });
  });

  it("parses model-breakdown cost fields", async () => {
    const invoke = vi.fn(async () => ({
      models: [
        {
          modelNormalized: "gpt-5.6-terra",
          agentKind: "pi",
          totalTokens: 1234,
          inputTokens: 1000,
          outputTokens: 234,
          totalCostUsd: 0.25,
          percentage: 75,
        },
      ],
    }));
    const client = new DaemonOverviewClient(invoke);

    const result = await client.getModelBreakdown({ range: "7d" });

    expect(result.models[0]).toMatchObject({
      modelNormalized: "gpt-5.6-terra",
      totalCostUsd: 0.25,
    });
  });

  it("parses closed-workspace cost fields from workspace insights", async () => {
    const invoke = vi.fn(async () => ({
      closedWorkspaceCount: 1,
      averageLifetimeHours: 4.5,
      lastClosedWorkspaces: [
        {
          id: "workspace-1",
          projectId: "project-1",
          projectName: "Core",
          branch: "feature/cost",
          createdAt: "2026-08-03 10:00:00",
          closedAt: "2026-08-03 14:30:00",
          lifetimeHours: 4.5,
          totalTokens: 1234,
          totalCostUsd: 0.25,
        },
      ],
      primaryWorkspaceCount: 0,
      primaryWorkspaceTokens: 0,
      topPrimaryWorkspaces: [],
    }));
    const client = new DaemonOverviewClient(invoke);

    const result = await client.getWorkspaceInsights({ range: "7d" });

    expect(result.lastClosedWorkspaces[0]).toMatchObject({
      id: "workspace-1",
      totalTokens: 1234,
      totalCostUsd: 0.25,
    });
  });

  it("parses primary-workspace cost fields from workspace insights", async () => {
    const invoke = vi.fn(async () => ({
      closedWorkspaceCount: 0,
      averageLifetimeHours: null,
      lastClosedWorkspaces: [],
      primaryWorkspaceCount: 1,
      primaryWorkspaceTokens: 4567,
      topPrimaryWorkspaces: [
        {
          id: "workspace-2",
          projectId: "project-1",
          projectName: "Core",
          branch: "main",
          createdAt: "2026-08-03 10:00:00",
          totalTokens: 4567,
          totalCostUsd: 1.5,
        },
      ],
    }));
    const client = new DaemonOverviewClient(invoke);

    const result = await client.getWorkspaceInsights({ range: "7d" });

    expect(result.topPrimaryWorkspaces[0]).toMatchObject({
      id: "workspace-2",
      totalTokens: 4567,
      totalCostUsd: 1.5,
    });
  });

  it("defaults closed-workspace cost to zero when the daemon omits it", async () => {
    const invoke = vi.fn(async () => ({
      closedWorkspaceCount: 1,
      averageLifetimeHours: 4.5,
      lastClosedWorkspaces: [
        {
          id: "workspace-1",
          projectId: "project-1",
          projectName: "Core",
          branch: "feature/cost",
          createdAt: "2026-08-03 10:00:00",
          closedAt: "2026-08-03 14:30:00",
          lifetimeHours: 4.5,
          totalTokens: 1234,
        },
      ],
      primaryWorkspaceCount: 0,
      primaryWorkspaceTokens: 0,
      topPrimaryWorkspaces: [],
    }));
    const client = new DaemonOverviewClient(invoke);

    await expect(client.getWorkspaceInsights({ range: "7d" })).resolves.toMatchObject({
      lastClosedWorkspaces: [
        {
          id: "workspace-1",
          totalCostUsd: 0,
        },
      ],
    });
  });
});
