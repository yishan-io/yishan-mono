import type { OverviewTimeRange } from "../api/overviewApi.types";
import { getErrorMessage } from "../helpers/errorHelpers";
import { getDaemonClient } from "../rpc/rpcTransport";
import { overviewStore } from "../store/overviewStore";

export async function refreshOverviewTokenUsage(): Promise<void> {
  const { timeRange, selectedProjectId, granularity } = overviewStore.getState();
  overviewStore.getState().setTokenUsageLoadState("loading");

  try {
    const client = await getDaemonClient();
    const result = (await client.overview.getTokenUsage({
      range: timeRange,
      projectId: selectedProjectId || undefined,
      granularity,
    })) as {
      series: Array<{
        bucketStartUtc: string;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens: number;
        cachedWriteTokens: number;
        turnCount: number;
        toolCallCount: number;
      }>;
      cachedTotal: number;
      cachedWriteTotal: number;
      uncachedTotal: number;
      grandTotal: number;
      turnTotal: number;
      toolCallTotal: number;
    };
    overviewStore
      .getState()
      .setTokenUsageData(
        result.series,
        result.grandTotal,
        result.cachedTotal,
        result.uncachedTotal,
        result.turnTotal,
        result.toolCallTotal,
      );
    overviewStore.getState().setTokenUsageLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setTokenUsageLoadState("error", getErrorMessage(error));
  }
}

export async function refreshOverviewModelBreakdown(): Promise<void> {
  const { timeRange, selectedProjectId } = overviewStore.getState();
  overviewStore.getState().setModelBreakdownLoadState("loading");

  try {
    const client = await getDaemonClient();
    const result = (await client.overview.getModelBreakdown({
      range: timeRange,
      projectId: selectedProjectId || undefined,
    })) as {
      models: Array<{
        modelNormalized: string;
        agentKind: string;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        percentage: number;
      }>;
    };
    overviewStore.getState().setModelBreakdown(result.models);
    overviewStore.getState().setModelBreakdownLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setModelBreakdownLoadState("error", getErrorMessage(error));
  }
}

export async function refreshOverviewAgentKindBreakdown(): Promise<void> {
  const { timeRange, selectedProjectId } = overviewStore.getState();
  overviewStore.getState().setAgentKindBreakdownLoadState("loading");

  try {
    const client = await getDaemonClient();
    const result = (await client.overview.getAgentKindBreakdown({
      range: timeRange,
      projectId: selectedProjectId || undefined,
    })) as {
      agentKinds: Array<{
        agentKind: string;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        percentage: number;
      }>;
    };
    overviewStore.getState().setAgentKindBreakdown(result.agentKinds);
    overviewStore.getState().setAgentKindBreakdownLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setAgentKindBreakdownLoadState("error", getErrorMessage(error));
  }
}

export async function refreshOverviewWorkspaceInsights(): Promise<void> {
  const { timeRange, selectedProjectId } = overviewStore.getState();
  overviewStore.getState().setWorkspaceInsightsLoadState("loading");

  try {
    const client = await getDaemonClient();
    const result = (await client.overview.getWorkspaceInsights({
      range: timeRange,
      projectId: selectedProjectId || undefined,
    })) as {
      closedWorkspaceCount: number;
      averageLifetimeHours: number | null;
      lastClosedWorkspaces: Array<{
        id: string;
        projectId: string;
        projectName: string;
        branch: string | null;
        createdAt: string;
        closedAt: string;
        lifetimeHours: number;
        totalTokens: number;
      }>;
      primaryWorkspaceCount: number;
      primaryWorkspaceTokens: number;
      topPrimaryWorkspaces: Array<{
        id: string;
        projectId: string;
        projectName: string;
        branch: string | null;
        createdAt: string;
        totalTokens: number;
      }>;
    };
    overviewStore.getState().setWorkspaceInsights(result);
    overviewStore.getState().setWorkspaceInsightsLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setWorkspaceInsightsLoadState("error", getErrorMessage(error));
  }
}

export async function loadAllOverviewData(): Promise<void> {
  await Promise.all([
    refreshOverviewTokenUsage(),
    refreshOverviewModelBreakdown(),
    refreshOverviewAgentKindBreakdown(),
    refreshOverviewWorkspaceInsights(),
  ]);
}

export function setOverviewTimeRange(range: OverviewTimeRange): void {
  overviewStore.getState().setTimeRange(range);
  void loadAllOverviewData();
}

export function setOverviewProjectId(projectId: string | undefined): void {
  overviewStore.getState().setSelectedProjectId(projectId);
  void loadAllOverviewData();
}

export function setOverviewGranularity(granularity: "hour" | "day"): void {
  overviewStore.getState().setGranularity(granularity);
  void refreshOverviewTokenUsage();
}
