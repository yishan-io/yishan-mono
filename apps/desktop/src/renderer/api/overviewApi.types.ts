export type TokenUsageSeriesItem = {
  bucketStartUtc: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cachedWriteTokens: number;
};

export type OverviewTokenUsageResponse = {
  series: TokenUsageSeriesItem[];
  cachedTotal: number;
  uncachedTotal: number;
};

export type ModelBreakdownItem = {
  modelNormalized: string;
  agentKind: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
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
};

export type WorkspaceInsightsResult = {
  closedWorkspaceCount: number;
  averageLifetimeHours: number | null;
  lastClosedWorkspaces: ClosedWorkspaceItem[];
};

export type OverviewTimeRange = "7d" | "30d" | "90d";

export type OverviewGranularity = "hour" | "day";
