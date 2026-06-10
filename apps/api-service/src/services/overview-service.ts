import { and, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { type OrganizationMemberRole, projects, tokenUsageHourly, workspaces } from "@/db/schema";
import type { OrganizationService } from "@/services/organization-service";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import type { OverviewGranularity, OverviewTimeRange } from "@/validation/overview";

type OverviewTokenUsageInput = {
  organizationId: string;
  actorUserId: string;
  actorRole?: OrganizationMemberRole;
  range: OverviewTimeRange;
  projectId?: string;
  granularity: OverviewGranularity;
};

type OverviewModelBreakdownInput = {
  organizationId: string;
  actorUserId: string;
  actorRole?: OrganizationMemberRole;
  range: OverviewTimeRange;
  projectId?: string;
};

const RANGE_DAYS: Record<OverviewTimeRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type TokenUsageSeriesItem = {
  bucketStartUtc: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cachedWriteTokens: number;
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

function rangeHours(range: OverviewTimeRange): number {
  return RANGE_DAYS[range] * 24;
}

function hoursToMillis(range: OverviewTimeRange): number {
  return rangeHours(range) * 60 * 60 * 1000;
}

export class OverviewService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  async getTokenUsage(input: OverviewTokenUsageInput): Promise<{
    series: TokenUsageSeriesItem[];
    cachedTotal: number;
    cachedWriteTotal: number;
    uncachedTotal: number;
  }> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    const now = new Date();
    const fromDate = new Date(now.getTime() - hoursToMillis(input.range));

    const truncSegment =
      input.granularity === "day" ? "date_trunc('day', bucket_start_hour_utc)" : "bucket_start_hour_utc";

    const projectFilter = input.projectId ? sql`AND project_id = ${input.projectId}` : sql``;

    const result = await this.db.execute(sql`
      SELECT
        ${sql.raw(truncSegment)} AS bucket,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
        COALESCE(SUM(cached_input_tokens), 0)::bigint AS cached_input_tokens,
        COALESCE(SUM(cached_write_tokens), 0)::bigint AS cached_write_tokens
      FROM token_usage_hourly
      WHERE organization_id = ${input.organizationId}
        AND bucket_start_hour_utc >= ${fromDate.toISOString()}
        AND bucket_start_hour_utc <= ${now.toISOString()}
        ${projectFilter}
      GROUP BY bucket
      ORDER BY bucket
    `);

    const series: TokenUsageSeriesItem[] = result.rows.map((row: Record<string, unknown>) => ({
      bucketStartUtc: row.bucket instanceof Date ? row.bucket.toISOString() : String(row.bucket ?? ""),
      totalTokens: Number(row.total_tokens ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      cachedInputTokens: Number(row.cached_input_tokens ?? 0),
      cachedWriteTokens: Number(row.cached_write_tokens ?? 0),
    }));
    const cachedTotal = series.reduce((acc, item) => acc + item.cachedInputTokens, 0);
    const cachedWriteTotal = series.reduce((acc, item) => acc + item.cachedWriteTokens, 0);
    const grandTotal = series.reduce((acc, item) => acc + item.totalTokens, 0);
    const uncachedTotal = Math.max(0, grandTotal - cachedTotal);

    return { series, cachedTotal, cachedWriteTotal, uncachedTotal };
  }

  async getModelBreakdown(input: OverviewModelBreakdownInput): Promise<{
    models: ModelBreakdownItem[];
  }> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    const now = new Date();
    const fromDate = new Date(now.getTime() - hoursToMillis(input.range));
    const conditions = [
      eq(tokenUsageHourly.organizationId, input.organizationId),
      gte(tokenUsageHourly.bucketStartHourUtc, fromDate),
      lte(tokenUsageHourly.bucketStartHourUtc, now),
    ];
    if (input.projectId) {
      conditions.push(eq(tokenUsageHourly.projectId, input.projectId));
    }

    const rows = await this.db
      .select({
        modelNormalized: tokenUsageHourly.modelNormalized,
        agentKind: tokenUsageHourly.agentKind,
        totalTokens: sum(tokenUsageHourly.totalTokens).mapWith(Number),
        inputTokens: sum(tokenUsageHourly.inputTokens).mapWith(Number),
        outputTokens: sum(tokenUsageHourly.outputTokens).mapWith(Number),
      })
      .from(tokenUsageHourly)
      .where(and(...conditions))
      .groupBy(tokenUsageHourly.modelNormalized, tokenUsageHourly.agentKind)
      .orderBy((fields) => [desc(fields.totalTokens)]);

    const grandTotal = rows.reduce((acc, row) => acc + (row.totalTokens ?? 0), 0);

    const models: ModelBreakdownItem[] = rows.map((row) => ({
      modelNormalized: row.modelNormalized,
      agentKind: row.agentKind,
      totalTokens: row.totalTokens ?? 0,
      inputTokens: row.inputTokens ?? 0,
      outputTokens: row.outputTokens ?? 0,
      percentage: grandTotal > 0 ? ((row.totalTokens ?? 0) / grandTotal) * 100 : 0,
    }));

    return { models };
  }

  async getAgentKindBreakdown(input: OverviewModelBreakdownInput): Promise<{
    agentKinds: AgentKindBreakdownItem[];
  }> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    const now = new Date();
    const fromDate = new Date(now.getTime() - hoursToMillis(input.range));
    const conditions = [
      eq(tokenUsageHourly.organizationId, input.organizationId),
      gte(tokenUsageHourly.bucketStartHourUtc, fromDate),
      lte(tokenUsageHourly.bucketStartHourUtc, now),
    ];
    if (input.projectId) {
      conditions.push(eq(tokenUsageHourly.projectId, input.projectId));
    }

    const rows = await this.db
      .select({
        agentKind: tokenUsageHourly.agentKind,
        totalTokens: sum(tokenUsageHourly.totalTokens).mapWith(Number),
        inputTokens: sum(tokenUsageHourly.inputTokens).mapWith(Number),
        outputTokens: sum(tokenUsageHourly.outputTokens).mapWith(Number),
      })
      .from(tokenUsageHourly)
      .where(and(...conditions))
      .groupBy(tokenUsageHourly.agentKind)
      .orderBy((fields) => [desc(fields.totalTokens)]);

    const grandTotal = rows.reduce((acc, row) => acc + (row.totalTokens ?? 0), 0);

    const agentKinds: AgentKindBreakdownItem[] = rows.map((row) => ({
      agentKind: row.agentKind,
      totalTokens: row.totalTokens ?? 0,
      inputTokens: row.inputTokens ?? 0,
      outputTokens: row.outputTokens ?? 0,
      percentage: grandTotal > 0 ? ((row.totalTokens ?? 0) / grandTotal) * 100 : 0,
    }));

    return { agentKinds };
  }

  async getWorkspaceInsights(input: {
    organizationId: string;
    actorUserId: string;
    actorRole?: OrganizationMemberRole;
    projectId?: string;
  }): Promise<WorkspaceInsightsResult> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    const baseConditions = [eq(workspaces.organizationId, input.organizationId), eq(workspaces.status, "closed")];
    if (input.projectId) {
      baseConditions.push(eq(workspaces.projectId, input.projectId));
    }

    const closedCountRow = await this.db
      .select({ count: count() })
      .from(workspaces)
      .where(and(...baseConditions));

    const closedWorkspaceCount = closedCountRow[0]?.count ?? 0;

    const lifetimeRow = await this.db
      .select({
        avgSeconds: sql<number>`AVG(EXTRACT(EPOCH FROM (${workspaces.updatedAt} - ${workspaces.createdAt})))`.mapWith(
          Number,
        ),
      })
      .from(workspaces)
      .where(and(...baseConditions));

    const averageLifetimeHours = lifetimeRow[0]?.avgSeconds != null ? lifetimeRow[0].avgSeconds / 3600 : null;

    const lastClosedRows = await this.db
      .select({
        id: workspaces.id,
        projectId: workspaces.projectId,
        branch: workspaces.branch,
        createdAt: workspaces.createdAt,
        closedAt: workspaces.updatedAt,
      })
      .from(workspaces)
      .where(and(...baseConditions))
      .orderBy(desc(workspaces.updatedAt))
      .limit(5);

    const lastClosedWorkspaces: ClosedWorkspaceItem[] = [];

    for (const ws of lastClosedRows) {
      const projectRow = await this.db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, ws.projectId))
        .limit(1);

      const projectName = projectRow[0]?.name ?? ws.projectId;

      const tokenRow = await this.db
        .select({
          totalTokens: sum(tokenUsageHourly.totalTokens).mapWith(Number),
        })
        .from(tokenUsageHourly)
        .where(eq(tokenUsageHourly.workspaceId, ws.id));

      const totalTokens = tokenRow[0]?.totalTokens ?? 0;
      const lifetimeMs = ws.closedAt.getTime() - ws.createdAt.getTime();
      const lifetimeHours = Math.max(0, lifetimeMs / (1000 * 60 * 60));

      lastClosedWorkspaces.push({
        id: ws.id,
        projectId: ws.projectId,
        projectName,
        branch: ws.branch,
        createdAt: ws.createdAt.toISOString(),
        closedAt: ws.closedAt.toISOString(),
        lifetimeHours: Math.round(lifetimeHours * 10) / 10,
        totalTokens,
      });
    }

    return {
      closedWorkspaceCount,
      averageLifetimeHours: averageLifetimeHours != null ? Math.round(averageLifetimeHours * 10) / 10 : null,
      lastClosedWorkspaces,
    };
  }
}
