import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { overviewStore } from "../../../domains/overview/state/overviewStore";

import { sessionStore } from "@renderer/domains/session";
import {
  getOverviewAgentKindBreakdown,
  getOverviewModelBreakdown,
  getOverviewTokenUsage,
  getOverviewWorkspaceInsights,
} from "../api/overviewApi";
import type { OverviewTimeRange } from "../overviewTypes";

function selectedOrganizationId(): string {
  const organizationId = sessionStore.getState().selectedOrganizationId?.trim() || "";
  if (!organizationId) {
    throw new Error("No organization selected");
  }
  return organizationId;
}

export async function refreshOverviewTokenUsage(): Promise<void> {
  const { timeRange, selectedProjectId, granularity } = overviewStore.getState();
  overviewStore.getState().setTokenUsageLoadState("loading");

  try {
    const result = await getOverviewTokenUsage(selectedOrganizationId(), {
      range: timeRange,
      projectId: selectedProjectId || undefined,
      granularity,
    });
    overviewStore
      .getState()
      .setTokenUsageData(
        result.series,
        result.grandTotal,
        result.cachedTotal,
        result.cachedWriteTotal,
        result.uncachedTotal,
        result.turnTotal,
        result.toolCallTotal,
        result.totalCostUsd,
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
    const result = await getOverviewModelBreakdown(selectedOrganizationId(), {
      range: timeRange,
      projectId: selectedProjectId || undefined,
    });
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
    const result = await getOverviewAgentKindBreakdown(selectedOrganizationId(), {
      range: timeRange,
      projectId: selectedProjectId || undefined,
    });
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
    const result = await getOverviewWorkspaceInsights(selectedOrganizationId(), {
      range: timeRange,
      projectId: selectedProjectId || undefined,
    });
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

export type { OverviewTimeRange } from "../api/overviewApi.types";
