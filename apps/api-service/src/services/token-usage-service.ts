import type { AgentKind } from "@yishan-io/core";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { type OrganizationMemberRole, tokenUsageHourly, workspaces } from "@/db/schema";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";

type UpsertTokenUsageHourlyInput = {
  organizationId: string;
  actorUserId: string;
  actorRole?: OrganizationMemberRole;
  rows: Array<{
    projectId: string;
    workspaceId: string;
    workspacePath: string;
    agentKind: AgentKind;
    model: string;
    modelNormalized: string;
    bucketStartHourUtc: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    cachedWriteTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    totalCostMicrosUsd?: number;
    costSource?: "unknown" | "estimated" | "direct";
    eventCount: number;
    sessionCount: number;
    turnCount: number;
    toolCallCount: number;
    attributionConfidence: "exact" | "prefix_match" | "fallback_unknown";
    ingestedAt: string;
    runId: string;
  }>;
};

type ListTokenUsageHourlyInput = {
  organizationId: string;
  actorUserId: string;
  actorRole?: OrganizationMemberRole;
  projectId?: string;
  workspaceId?: string;
  agentKind?: AgentKind;
  from?: string;
  to?: string;
  limit: number;
};

const CONFLICT_KEY_FIELDS = ["projectId", "workspaceId", "agentKind", "modelNormalized", "bucketStartHourUtc"] as const;

function costSourcePriority(source: UpsertTokenUsageHourlyInput["rows"][number]["costSource"]): number {
  switch (source) {
    case "direct":
      return 3;
    case "estimated":
      return 2;
    default:
      return 1;
  }
}

function normalizeIncomingRow(
  row: UpsertTokenUsageHourlyInput["rows"][number],
): UpsertTokenUsageHourlyInput["rows"][number] {
  return {
    ...row,
    totalCostMicrosUsd: row.totalCostMicrosUsd ?? 0,
    costSource: row.costSource ?? "unknown",
  };
}

function dedupeRows(rows: UpsertTokenUsageHourlyInput["rows"]): UpsertTokenUsageHourlyInput["rows"] {
  const byKey = new Map<string, UpsertTokenUsageHourlyInput["rows"][number]>();

  for (const originalRow of rows) {
    const row = normalizeIncomingRow(originalRow);
    const key = CONFLICT_KEY_FIELDS.map((f) => row[f]).join("|");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    existing.inputTokens += row.inputTokens;
    existing.outputTokens += row.outputTokens;
    existing.cachedInputTokens += row.cachedInputTokens;
    existing.cachedWriteTokens += row.cachedWriteTokens;
    existing.reasoningTokens += row.reasoningTokens;
    existing.totalTokens += row.totalTokens;
    existing.totalCostMicrosUsd = (existing.totalCostMicrosUsd ?? 0) + (row.totalCostMicrosUsd ?? 0);
    if (costSourcePriority(row.costSource ?? "unknown") > costSourcePriority(existing.costSource ?? "unknown")) {
      existing.costSource = row.costSource ?? "unknown";
    }
    existing.eventCount += row.eventCount;
    existing.sessionCount += row.sessionCount;
    existing.turnCount += row.turnCount;
    existing.toolCallCount += row.toolCallCount;
    if (new Date(row.ingestedAt) > new Date(existing.ingestedAt)) {
      existing.workspacePath = row.workspacePath;
      existing.model = row.model;
      existing.attributionConfidence = row.attributionConfidence;
      existing.ingestedAt = row.ingestedAt;
      existing.runId = row.runId;
    }
  }

  return Array.from(byKey.values());
}

export class TokenUsageService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  async upsertHourly(input: UpsertTokenUsageHourlyInput): Promise<{ upserted: number }> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    if (input.rows.length === 0) {
      return { upserted: 0 };
    }

    const deduped = dedupeRows(input.rows);
    const validRows = await this.filterRowsWithKnownWorkspaces(input.organizationId, deduped);
    if (validRows.length === 0) {
      return { upserted: 0 };
    }

    const now = new Date();
    const rowsToInsert = validRows.map((row) => ({
      id: newId(),
      organizationId: input.organizationId,
      projectId: row.projectId,
      workspaceId: row.workspaceId,
      workspacePath: row.workspacePath,
      agentKind: row.agentKind,
      model: row.model,
      modelNormalized: row.modelNormalized,
      bucketStartHourUtc: new Date(row.bucketStartHourUtc),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cachedInputTokens: row.cachedInputTokens,
      cachedWriteTokens: row.cachedWriteTokens,
      reasoningTokens: row.reasoningTokens,
      totalTokens: row.totalTokens,
      totalCostMicrosUsd: row.totalCostMicrosUsd ?? 0,
      costSource: row.costSource ?? "unknown",
      eventCount: row.eventCount,
      sessionCount: row.sessionCount,
      turnCount: row.turnCount,
      toolCallCount: row.toolCallCount,
      attributionConfidence: row.attributionConfidence,
      ingestedAt: new Date(row.ingestedAt),
      runId: row.runId,
      updatedAt: now,
    }));

    await this.db
      .insert(tokenUsageHourly)
      .values(rowsToInsert)
      .onConflictDoUpdate({
        target: [
          tokenUsageHourly.organizationId,
          tokenUsageHourly.projectId,
          tokenUsageHourly.workspaceId,
          tokenUsageHourly.agentKind,
          tokenUsageHourly.modelNormalized,
          tokenUsageHourly.bucketStartHourUtc,
        ],
        set: {
          workspacePath: sql`excluded.workspace_path`,
          model: sql`excluded.model`,
          inputTokens: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.inputTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.inputTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.inputTokens}
            ELSE ${sql.raw("excluded.input_tokens")}
          END`,
          outputTokens: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.outputTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.outputTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.outputTokens}
            ELSE ${sql.raw("excluded.output_tokens")}
          END`,
          cachedInputTokens: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.cachedInputTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.cachedInputTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.cachedInputTokens}
            ELSE ${sql.raw("excluded.cached_input_tokens")}
          END`,
          cachedWriteTokens: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.cachedWriteTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.cachedWriteTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.cachedWriteTokens}
            ELSE ${sql.raw("excluded.cached_write_tokens")}
          END`,
          reasoningTokens: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.reasoningTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.reasoningTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.reasoningTokens}
            ELSE ${sql.raw("excluded.reasoning_tokens")}
          END`,
          totalTokens: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.totalTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.totalTokens}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.totalTokens}
            ELSE ${sql.raw("excluded.total_tokens")}
          END`,
          totalCostMicrosUsd: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.totalCostMicrosUsd}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.totalCostMicrosUsd}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.totalCostMicrosUsd}
            ELSE ${sql.raw("excluded.total_cost_micros_usd")}
          END`,
          costSource: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.costSource}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.costSource}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.costSource}
            ELSE ${sql.raw("excluded.cost_source")}
          END`,
          eventCount: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.eventCount}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.eventCount}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.eventCount}
            ELSE ${sql.raw("excluded.event_count")}
          END`,
          sessionCount: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.sessionCount}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.sessionCount}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.sessionCount}
            ELSE ${sql.raw("excluded.session_count")}
          END`,
          turnCount: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.turnCount}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.turnCount}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.turnCount}
            ELSE ${sql.raw("excluded.turn_count")}
          END`,
          toolCallCount: sql`CASE
            WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${tokenUsageHourly.toolCallCount}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")} AND (
              CASE ${tokenUsageHourly.costSource}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) > (
              CASE ${sql.raw("excluded.cost_source")}
                WHEN 'direct' THEN 3
                WHEN 'estimated' THEN 2
                ELSE 1
              END
            ) THEN ${tokenUsageHourly.toolCallCount}
            WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
              AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
              AND ${tokenUsageHourly.costSource} = 'estimated'
              AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
              AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${tokenUsageHourly.toolCallCount}
            ELSE ${sql.raw("excluded.tool_call_count")}
          END`,
          attributionConfidence: sql`excluded.attribution_confidence`,
          ingestedAt: sql`excluded.ingested_at`,
          runId: sql`excluded.run_id`,
          updatedAt: now,
        },
      });

    return { upserted: validRows.length };
  }

  private async filterRowsWithKnownWorkspaces(
    organizationId: string,
    rows: UpsertTokenUsageHourlyInput["rows"],
  ): Promise<UpsertTokenUsageHourlyInput["rows"]> {
    const workspaceIds = Array.from(new Set(rows.map((row) => row.workspaceId.trim()).filter(Boolean)));
    if (workspaceIds.length === 0) {
      return [];
    }

    const existingWorkspaces = await this.db
      .select({ id: workspaces.id, projectId: workspaces.projectId })
      .from(workspaces)
      .where(and(eq(workspaces.organizationId, organizationId), inArray(workspaces.id, workspaceIds)));

    const workspaceById = new Map(existingWorkspaces.map((workspace) => [workspace.id, workspace]));
    const filtered = rows.filter((row) => {
      const workspace = workspaceById.get(row.workspaceId);
      return workspace?.projectId === row.projectId;
    });

    const skippedCount = rows.length - filtered.length;
    if (skippedCount > 0) {
      console.warn(
        `[TokenUsageService.upsertHourly] Skipped ${skippedCount} token usage rows with missing or mismatched workspace references for organization ${organizationId}`,
      );
    }

    return filtered;
  }

  async listHourly(input: ListTokenUsageHourlyInput) {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    const conditions = [eq(tokenUsageHourly.organizationId, input.organizationId)];
    if (input.projectId) {
      conditions.push(eq(tokenUsageHourly.projectId, input.projectId));
    }
    if (input.workspaceId) {
      conditions.push(eq(tokenUsageHourly.workspaceId, input.workspaceId));
    }
    if (input.agentKind) {
      conditions.push(eq(tokenUsageHourly.agentKind, input.agentKind));
    }
    if (input.from) {
      conditions.push(gte(tokenUsageHourly.bucketStartHourUtc, new Date(input.from)));
    }
    if (input.to) {
      conditions.push(lte(tokenUsageHourly.bucketStartHourUtc, new Date(input.to)));
    }

    return this.db
      .select()
      .from(tokenUsageHourly)
      .where(and(...conditions))
      .orderBy(desc(tokenUsageHourly.bucketStartHourUtc))
      .limit(input.limit);
  }
}
