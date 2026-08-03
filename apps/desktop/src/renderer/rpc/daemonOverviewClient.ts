import { asRecord, readOptionalNumber, readOptionalString } from "./helpers";

function requireString(value: unknown): string {
  if (typeof value !== "string") throw new Error(`expected string, got ${typeof value}`);
  return value;
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`expected number, got ${typeof value}`);
  return value;
}

type TokenUsageSeriesItem = {
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

type OverviewTokenUsageResponse = {
  series: TokenUsageSeriesItem[];
  cachedTotal: number;
  cachedWriteTotal: number;
  uncachedTotal: number;
  grandTotal: number;
  turnTotal: number;
  toolCallTotal: number;
  totalCostUsd: number;
};

type ModelBreakdownItem = {
  modelNormalized: string;
  agentKind: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  percentage: number;
};

type AgentKindBreakdownItem = {
  agentKind: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  percentage: number;
};

type ClosedWorkspaceItem = {
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

type PrimaryWorkspaceItem = {
  id: string;
  projectId: string;
  projectName: string;
  branch: string | null;
  createdAt: string;
  totalTokens: number;
  totalCostUsd: number;
};

type WorkspaceInsightsResult = {
  closedWorkspaceCount: number;
  averageLifetimeHours: number | null;
  lastClosedWorkspaces: ClosedWorkspaceItem[];
  primaryWorkspaceCount: number;
  primaryWorkspaceTokens: number;
  topPrimaryWorkspaces: PrimaryWorkspaceItem[];
};

function parseSeriesItem(item: unknown): TokenUsageSeriesItem {
  const r = asRecord(item);
  return {
    bucketStartUtc: requireString(r?.bucketStartUtc),
    totalTokens: requireNumber(r?.totalTokens),
    inputTokens: requireNumber(r?.inputTokens),
    outputTokens: requireNumber(r?.outputTokens),
    cachedInputTokens: requireNumber(r?.cachedInputTokens),
    cachedWriteTokens: requireNumber(r?.cachedWriteTokens),
    turnCount: requireNumber(r?.turnCount),
    toolCallCount: requireNumber(r?.toolCallCount),
    totalCostUsd: readOptionalNumber(r?.totalCostUsd) ?? 0,
  };
}

function parseTokenUsage(result: unknown): OverviewTokenUsageResponse {
  const r = asRecord(result);
  return {
    series: Array.isArray(r?.series) ? r.series.map(parseSeriesItem) : [],
    cachedTotal: requireNumber(r?.cachedTotal),
    cachedWriteTotal: requireNumber(r?.cachedWriteTotal),
    uncachedTotal: requireNumber(r?.uncachedTotal),
    grandTotal: requireNumber(r?.grandTotal),
    turnTotal: requireNumber(r?.turnTotal),
    toolCallTotal: requireNumber(r?.toolCallTotal),
    totalCostUsd: readOptionalNumber(r?.totalCostUsd) ?? 0,
  };
}

function parseModelItem(item: unknown): ModelBreakdownItem {
  const r = asRecord(item);
  return {
    modelNormalized: requireString(r?.modelNormalized),
    agentKind: requireString(r?.agentKind),
    totalTokens: requireNumber(r?.totalTokens),
    inputTokens: requireNumber(r?.inputTokens),
    outputTokens: requireNumber(r?.outputTokens),
    totalCostUsd: readOptionalNumber(r?.totalCostUsd) ?? 0,
    percentage: requireNumber(r?.percentage),
  };
}

function parseModelBreakdown(result: unknown): { models: ModelBreakdownItem[] } {
  const r = asRecord(result);
  return {
    models: Array.isArray(r?.models) ? r.models.map(parseModelItem) : [],
  };
}

function parseAgentKindItem(item: unknown): AgentKindBreakdownItem {
  const r = asRecord(item);
  return {
    agentKind: requireString(r?.agentKind),
    totalTokens: requireNumber(r?.totalTokens),
    inputTokens: requireNumber(r?.inputTokens),
    outputTokens: requireNumber(r?.outputTokens),
    percentage: requireNumber(r?.percentage),
  };
}

function parseAgentKindBreakdown(result: unknown): { agentKinds: AgentKindBreakdownItem[] } {
  const r = asRecord(result);
  return {
    agentKinds: Array.isArray(r?.agentKinds) ? r.agentKinds.map(parseAgentKindItem) : [],
  };
}

function parseClosedWorkspace(item: unknown): ClosedWorkspaceItem {
  const r = asRecord(item);
  return {
    id: requireString(r?.id),
    projectId: requireString(r?.projectId),
    projectName: requireString(r?.projectName),
    branch: readOptionalString(r?.branch) ?? null,
    createdAt: requireString(r?.createdAt),
    closedAt: requireString(r?.closedAt),
    lifetimeHours: requireNumber(r?.lifetimeHours),
    totalTokens: requireNumber(r?.totalTokens),
    totalCostUsd: readOptionalNumber(r?.totalCostUsd) ?? 0,
  };
}

function parsePrimaryWorkspace(item: unknown): PrimaryWorkspaceItem {
  const r = asRecord(item);
  return {
    id: requireString(r?.id),
    projectId: requireString(r?.projectId),
    projectName: requireString(r?.projectName),
    branch: readOptionalString(r?.branch) ?? null,
    createdAt: requireString(r?.createdAt),
    totalTokens: requireNumber(r?.totalTokens),
    totalCostUsd: readOptionalNumber(r?.totalCostUsd) ?? 0,
  };
}

function parseWorkspaceInsights(result: unknown): WorkspaceInsightsResult {
  const r = asRecord(result);
  return {
    closedWorkspaceCount: requireNumber(r?.closedWorkspaceCount),
    averageLifetimeHours: readOptionalNumber(r?.averageLifetimeHours) ?? null,
    lastClosedWorkspaces: Array.isArray(r?.lastClosedWorkspaces)
      ? r.lastClosedWorkspaces.map(parseClosedWorkspace)
      : [],
    primaryWorkspaceCount: requireNumber(r?.primaryWorkspaceCount),
    primaryWorkspaceTokens: requireNumber(r?.primaryWorkspaceTokens),
    topPrimaryWorkspaces: Array.isArray(r?.topPrimaryWorkspaces)
      ? r.topPrimaryWorkspaces.map(parsePrimaryWorkspace)
      : [],
  };
}

type InvokeFn = (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;

export class DaemonOverviewClient {
  private readonly invoke: InvokeFn;

  constructor(invoke: InvokeFn) {
    this.invoke = invoke;
  }

  async getTokenUsage(input: {
    range: string;
    projectId?: string;
    granularity: string;
  }): Promise<OverviewTokenUsageResponse> {
    const result = await this.invoke("overview.tokenUsage", input);
    return parseTokenUsage(result);
  }

  async getModelBreakdown(input: { range: string; projectId?: string }): Promise<{
    models: ModelBreakdownItem[];
  }> {
    const result = await this.invoke("overview.modelBreakdown", input);
    return parseModelBreakdown(result);
  }

  async getAgentKindBreakdown(input: { range: string; projectId?: string }): Promise<{
    agentKinds: AgentKindBreakdownItem[];
  }> {
    const result = await this.invoke("overview.agentKindBreakdown", input);
    return parseAgentKindBreakdown(result);
  }

  async getWorkspaceInsights(input: { range: string; projectId?: string }): Promise<WorkspaceInsightsResult> {
    const result = await this.invoke("overview.workspaceInsights", input);
    return parseWorkspaceInsights(result);
  }
}
