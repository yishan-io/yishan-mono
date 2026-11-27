import { request } from "@renderer/rpc";
import { asRecord } from "@shared/validation/primitiveReaders";
import type {
  ClosedWorkspaceItem,
  ModelBreakdownItem,
  OverviewGranularity,
  OverviewTimeRange,
  OverviewTokenUsageResponse,
  PrimaryWorkspaceItem,
  TokenUsageSeriesItem,
  WorkspaceInsightsResult,
} from "./overviewDaemonTypes";

/** Scope for one local Overview read; empty IDs mean every project/organization on this device. */
export type OverviewQuery = {
  range: OverviewTimeRange;
  projectId?: string;
  organizationId?: string;
};

type RecordValue = Record<string, unknown>;

function requireRecord(value: unknown, field: string): RecordValue {
  const record = asRecord(value);
  if (!record) throw new TypeError(`Invalid overview response: ${field} is not an object`);
  return record;
}

function requireString(record: RecordValue, field: string): string {
  const value = record[field];
  if (typeof value !== "string") throw new TypeError(`Invalid overview response: ${field} is not a string`);
  return value;
}

function requireNumber(record: RecordValue, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Invalid overview response: ${field} is not a number`);
  }
  return value;
}

function requireNullableString(record: RecordValue, field: string): string | null {
  return record[field] === null || record[field] === undefined ? null : requireString(record, field);
}

function requireNullableNumber(record: RecordValue, field: string): number | null {
  return record[field] === null || record[field] === undefined ? null : requireNumber(record, field);
}

function requireArray<T>(record: RecordValue, field: string, parse: (item: RecordValue) => T): T[] {
  const value = record[field];
  if (!Array.isArray(value)) throw new TypeError(`Invalid overview response: ${field} is not an array`);
  return value.map((item) => parse(requireRecord(item, field)));
}

function parseSeriesItem(item: RecordValue): TokenUsageSeriesItem {
  return {
    bucketStartUtc: requireString(item, "bucketStartUtc"),
    totalTokens: requireNumber(item, "totalTokens"),
    inputTokens: requireNumber(item, "inputTokens"),
    outputTokens: requireNumber(item, "outputTokens"),
    cachedInputTokens: requireNumber(item, "cachedInputTokens"),
    cachedWriteTokens: requireNumber(item, "cachedWriteTokens"),
    turnCount: requireNumber(item, "turnCount"),
    toolCallCount: requireNumber(item, "toolCallCount"),
    totalCostUsd: requireNumber(item, "totalCostUsd"),
  };
}

function parseTokenUsage(payload: unknown): OverviewTokenUsageResponse {
  const record = requireRecord(payload, "tokenUsage");
  return {
    series: requireArray(record, "series", parseSeriesItem),
    cachedTotal: requireNumber(record, "cachedTotal"),
    cachedWriteTotal: requireNumber(record, "cachedWriteTotal"),
    uncachedTotal: requireNumber(record, "uncachedTotal"),
    grandTotal: requireNumber(record, "grandTotal"),
    turnTotal: requireNumber(record, "turnTotal"),
    toolCallTotal: requireNumber(record, "toolCallTotal"),
    totalCostUsd: requireNumber(record, "totalCostUsd"),
  };
}

function parseModelItem(item: RecordValue): ModelBreakdownItem {
  return {
    modelNormalized: requireString(item, "modelNormalized"),
    agentKind: requireString(item, "agentKind"),
    totalTokens: requireNumber(item, "totalTokens"),
    inputTokens: requireNumber(item, "inputTokens"),
    outputTokens: requireNumber(item, "outputTokens"),
    totalCostUsd: requireNumber(item, "totalCostUsd"),
    percentage: requireNumber(item, "percentage"),
  };
}

function parseClosedWorkspace(item: RecordValue): ClosedWorkspaceItem {
  return {
    id: requireString(item, "id"),
    projectId: requireString(item, "projectId"),
    projectName: requireString(item, "projectName"),
    branch: requireNullableString(item, "branch"),
    createdAt: requireString(item, "createdAt"),
    closedAt: requireString(item, "closedAt"),
    lifetimeHours: requireNumber(item, "lifetimeHours"),
    totalTokens: requireNumber(item, "totalTokens"),
    totalCostUsd: requireNumber(item, "totalCostUsd"),
  };
}

function parsePrimaryWorkspace(item: RecordValue): PrimaryWorkspaceItem {
  return {
    id: requireString(item, "id"),
    projectId: requireString(item, "projectId"),
    projectName: requireString(item, "projectName"),
    branch: requireNullableString(item, "branch"),
    createdAt: requireString(item, "createdAt"),
    totalTokens: requireNumber(item, "totalTokens"),
    totalCostUsd: requireNumber(item, "totalCostUsd"),
  };
}

function parseWorkspaceInsights(payload: unknown): WorkspaceInsightsResult {
  const record = requireRecord(payload, "workspaceInsights");
  return {
    closedWorkspaceCount: requireNumber(record, "closedWorkspaceCount"),
    averageLifetimeHours: requireNullableNumber(record, "averageLifetimeHours"),
    lastClosedWorkspaces: requireArray(record, "lastClosedWorkspaces", parseClosedWorkspace),
    primaryWorkspaceCount: requireNumber(record, "primaryWorkspaceCount"),
    primaryWorkspaceTokens: requireNumber(record, "primaryWorkspaceTokens"),
    topPrimaryWorkspaces: requireArray(record, "topPrimaryWorkspaces", parsePrimaryWorkspace),
  };
}

/** Removes empty optional scope fields so the daemon sees "no restriction". */
function toParams({ projectId, organizationId, ...rest }: OverviewQuery & { granularity?: OverviewGranularity }) {
  return {
    ...rest,
    ...(projectId?.trim() ? { projectId: projectId.trim() } : {}),
    ...(organizationId?.trim() ? { organizationId: organizationId.trim() } : {}),
  };
}

// Daemon boundary for per-device Overview analytics (`overview.*`): request
// shaping and strict response parsing over the shared RPC transport.

export async function getOverviewTokenUsage(
  query: OverviewQuery & { granularity: OverviewGranularity },
): Promise<OverviewTokenUsageResponse> {
  return parseTokenUsage(await request("overview.tokenUsage", toParams(query)));
}

export async function getOverviewModelBreakdown(query: OverviewQuery): Promise<{ models: ModelBreakdownItem[] }> {
  const record = requireRecord(await request("overview.modelBreakdown", toParams(query)), "modelBreakdown");
  return { models: requireArray(record, "models", parseModelItem) };
}

export async function getOverviewWorkspaceInsights(query: OverviewQuery): Promise<WorkspaceInsightsResult> {
  return parseWorkspaceInsights(await request("overview.workspaceInsights", toParams(query)));
}
