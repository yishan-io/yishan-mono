import { requestJson } from "@renderer/api/restClient";
import type { ModelBreakdownItem, OverviewTokenUsageResponse, WorkspaceInsightsResult } from "./overviewApi.types";

type OverviewQueryInput = { range: string; projectId?: string };
type TokenUsageQueryInput = OverviewQueryInput & { granularity?: string };

function overviewQueryString(input: OverviewQueryInput & { granularity?: string }): string {
  const params = new URLSearchParams({ range: input.range });
  if (input.projectId?.trim()) {
    params.set("projectId", input.projectId.trim());
  }
  if (input.granularity?.trim()) {
    params.set("granularity", input.granularity.trim());
  }
  return params.toString();
}

/** Fetches the org's token-usage series from the api-service (remote aggregate). */
export async function getOverviewTokenUsage(
  orgId: string,
  input: TokenUsageQueryInput,
): Promise<OverviewTokenUsageResponse> {
  return requestJson<OverviewTokenUsageResponse>(`/orgs/${orgId}/overview/token-usage?${overviewQueryString(input)}`);
}

export async function getOverviewModelBreakdown(
  orgId: string,
  input: OverviewQueryInput,
): Promise<{ models: ModelBreakdownItem[] }> {
  return requestJson<{ models: ModelBreakdownItem[] }>(
    `/orgs/${orgId}/overview/model-breakdown?${overviewQueryString(input)}`,
  );
}

export async function getOverviewWorkspaceInsights(
  orgId: string,
  input: OverviewQueryInput,
): Promise<WorkspaceInsightsResult> {
  return requestJson<WorkspaceInsightsResult>(
    `/orgs/${orgId}/overview/workspace-insights?${overviewQueryString(input)}`,
  );
}
