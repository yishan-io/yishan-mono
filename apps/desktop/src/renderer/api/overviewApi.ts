import type { ModelBreakdownItem, OverviewTokenUsageResponse, WorkspaceInsightsResult } from "./overviewApi.types";
import { requestJson } from "./restClient";

export type { ModelBreakdownItem, OverviewTokenUsageResponse, WorkspaceInsightsResult };

export async function loadOverviewTokenUsage(
  orgId: string,
  range: string,
  projectId?: string,
  granularity = "day",
): Promise<OverviewTokenUsageResponse> {
  const params = new URLSearchParams({ range, granularity });
  if (projectId) {
    params.set("projectId", projectId);
  }
  return requestJson<OverviewTokenUsageResponse>(`/orgs/${orgId}/overview/token-usage?${params.toString()}`);
}

export async function loadOverviewModelBreakdown(
  orgId: string,
  range: string,
  projectId?: string,
): Promise<{ models: ModelBreakdownItem[] }> {
  const params = new URLSearchParams({ range });
  if (projectId) {
    params.set("projectId", projectId);
  }
  return requestJson<{ models: ModelBreakdownItem[] }>(`/orgs/${orgId}/overview/model-breakdown?${params.toString()}`);
}

export async function loadOverviewWorkspaceInsights(
  orgId: string,
  projectId?: string,
): Promise<WorkspaceInsightsResult> {
  const params = new URLSearchParams();
  if (projectId) {
    params.set("projectId", projectId);
  }
  const query = params.toString();
  return requestJson<WorkspaceInsightsResult>(
    `/orgs/${orgId}/overview/workspace-insights${query ? `?${query}` : ""}`,
  );
}
