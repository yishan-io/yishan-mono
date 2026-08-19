/**
 * Overview feature view-model types (D14).
 *
 * Structural mirrors of the transport DTOs in `api/overviewApi.types`.
 * The Overview Store and Commands own these types so the State layer does not
 * import transport implementations (R6). Shapes are identical to the DTOs, so
 * no runtime conversion is required.
 */

export type TokenUsageSeriesItem = {
  bucketStartUtc: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cachedWriteTokens: number;
  turnCount: number;
  toolCallCount: number;
  totalCostUsd: number;
};

export type ModelBreakdownItem = {
  modelNormalized: string;
  agentKind: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  percentage: number;
};

export type AgentKindBreakdownItem = {
  agentKind: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  percentage: number;
};

export type ClosedWorkspaceItem = {
  id: string;
  projectId: string;
  projectName: string;
  branch: string | null;
  createdAt: string;
  closedAt: string;
  lifetimeHours: number;
  totalTokens: number;
  totalCostUsd: number;
};

export type PrimaryWorkspaceItem = {
  id: string;
  projectId: string;
  projectName: string;
  branch: string | null;
  createdAt: string;
  totalTokens: number;
  totalCostUsd: number;
};

export type WorkspaceInsightsResult = {
  closedWorkspaceCount: number;
  averageLifetimeHours: number | null;
  lastClosedWorkspaces: ClosedWorkspaceItem[];
  primaryWorkspaceCount: number;
  primaryWorkspaceTokens: number;
  topPrimaryWorkspaces: PrimaryWorkspaceItem[];
};

export type OverviewTimeRange = "7d" | "30d" | "90d";

export type OverviewGranularity = "hour" | "day";
