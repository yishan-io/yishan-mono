import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { overviewStore } from "../state/overviewStore";

import { projectStore } from "@renderer/domains/project";
import { sessionStore } from "@renderer/domains/session";
import {
  type OverviewQuery,
  getOverviewModelBreakdown,
  getOverviewTokenUsage,
  getOverviewWorkspaceInsights,
} from "../daemon/overviewDaemonProcedures";
import type { OverviewTimeRange, WorkspaceInsightsResult } from "../overviewTypes";

/**
 * Builds the local Overview scope. Overview reads this device's daemon
 * database, so no organization is required; when one is selected the
 * aggregates are limited to it, matching the org-scoped project filter.
 */
function currentQuery(): OverviewQuery {
  const { timeRange, selectedProjectId } = overviewStore.getState();
  return {
    range: timeRange,
    projectId: selectedProjectId || undefined,
    organizationId: sessionStore.getState().selectedOrganizationId?.trim() || undefined,
  };
}

/** The daemon only knows project IDs; display names come from the loaded project list. */
function withProjectNames(insights: WorkspaceInsightsResult): WorkspaceInsightsResult {
  const namesById = new Map(projectStore.getState().projects.map((project) => [project.id, project.name]));
  const resolve = <T extends { projectId: string; projectName: string }>(item: T): T => ({
    ...item,
    projectName: namesById.get(item.projectId) || item.projectName || item.projectId,
  });
  return {
    ...insights,
    lastClosedWorkspaces: insights.lastClosedWorkspaces.map(resolve),
    topPrimaryWorkspaces: insights.topPrimaryWorkspaces.map(resolve),
  };
}

export async function refreshOverviewTokenUsage(): Promise<void> {
  const { granularity } = overviewStore.getState();
  overviewStore.getState().setTokenUsageLoadState("loading");

  try {
    const result = await getOverviewTokenUsage({ ...currentQuery(), granularity });
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
  overviewStore.getState().setModelBreakdownLoadState("loading");

  try {
    const result = await getOverviewModelBreakdown(currentQuery());
    overviewStore.getState().setModelBreakdown(result.models);
    overviewStore.getState().setModelBreakdownLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setModelBreakdownLoadState("error", getErrorMessage(error));
  }
}

export async function refreshOverviewWorkspaceInsights(): Promise<void> {
  overviewStore.getState().setWorkspaceInsightsLoadState("loading");

  try {
    const result = await getOverviewWorkspaceInsights(currentQuery());
    overviewStore.getState().setWorkspaceInsights(withProjectNames(result));
    overviewStore.getState().setWorkspaceInsightsLoadState("loaded");
  } catch (error) {
    overviewStore.getState().setWorkspaceInsightsLoadState("error", getErrorMessage(error));
  }
}

export async function loadAllOverviewData(): Promise<void> {
  await Promise.all([refreshOverviewTokenUsage(), refreshOverviewModelBreakdown(), refreshOverviewWorkspaceInsights()]);
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

export type { OverviewTimeRange } from "../overviewTypes";
