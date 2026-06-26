import {
  loadOverviewAgentKindBreakdown,
  loadOverviewModelBreakdown,
  loadOverviewTokenUsage,
  loadOverviewWorkspaceInsights,
} from "../api/overviewApi";
import type { OverviewTimeRange } from "../api/overviewApi.types";
import { getErrorMessage } from "../helpers/errorHelpers";
import { overviewStore } from "../store/overviewStore";
import { sessionStore } from "../store/sessionStore";

async function resolveOrgId(): Promise<string | undefined> {
  return sessionStore.getState().selectedOrganizationId;
}

export async function refreshOverviewTokenUsage(): Promise<void> {
  const orgId = await resolveOrgId();
  if (!orgId) {
    return;
  }

  const { timeRange, selectedProjectId, granularity } = overviewStore.getState();

  overviewStore.getState().setTokenUsageLoadState("loading");

  try {
    const result = await loadOverviewTokenUsage(orgId, timeRange, selectedProjectId, granularity);
    overviewStore
      .getState()
      .setTokenUsageData(
        result.series,
        result.cachedTotal,
        result.cachedWriteTotal,
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
  const orgId = await resolveOrgId();
  if (!orgId) {
    return;
  }

  const { timeRange, selectedProjectId } = overviewStore.getState();

  overviewStore.getState().setModelBreakdownLoadState("loading");

  try {
    const result = await loadOverviewModelBreakdown(orgId, timeRange, selectedProjectId);
    overviewStore.getState().setModelBreakdown(result.models);
    overviewStore.getState().setModelBreakdownLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setModelBreakdownLoadState("error", getErrorMessage(error));
  }
}

export async function refreshOverviewAgentKindBreakdown(): Promise<void> {
  const orgId = await resolveOrgId();
  if (!orgId) {
    return;
  }

  const { timeRange, selectedProjectId } = overviewStore.getState();

  overviewStore.getState().setAgentKindBreakdownLoadState("loading");

  try {
    const result = await loadOverviewAgentKindBreakdown(orgId, timeRange, selectedProjectId);
    overviewStore.getState().setAgentKindBreakdown(result.agentKinds);
    overviewStore.getState().setAgentKindBreakdownLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setAgentKindBreakdownLoadState("error", getErrorMessage(error));
  }
}

export async function refreshOverviewWorkspaceInsights(): Promise<void> {
  const orgId = await resolveOrgId();
  if (!orgId) {
    return;
  }

  const { timeRange, selectedProjectId } = overviewStore.getState();

  overviewStore.getState().setWorkspaceInsightsLoadState("loading");

  try {
    const result = await loadOverviewWorkspaceInsights(orgId, timeRange, selectedProjectId);
    overviewStore.getState().setWorkspaceInsights(result);
    overviewStore.getState().setWorkspaceInsightsLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setWorkspaceInsightsLoadState("error", getErrorMessage(error));
  }
}

export async function loadAllOverviewData(): Promise<void> {
  const orgId = await resolveOrgId();
  if (!orgId) {
    return;
  }

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
