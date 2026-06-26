export type TokenUsageSeriesItem = {
  bucketStartUtc: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cachedWriteTokens: number;
  turnCount: number;
  toolCallCount: number;
};

export type OverviewTokenUsageResponse = {
  series: TokenUsageSeriesItem[];
  cachedTotal: number;
  cachedWriteTotal: number;
  uncachedTotal: number;
  turnTotal: number;
  toolCallTotal: number;
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

export type PrimaryWorkspaceItem = {
  id: string;
  projectId: string;
  projectName: string;
  branch: string | null;
  createdAt: string;
  totalTokens: number;
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
