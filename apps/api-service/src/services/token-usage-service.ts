import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { AgentKind } from "@yishan/core";

import type { AppDb } from "@/db/client";
import { tokenUsageHourly, type OrganizationMemberRole } from "@/db/schema";
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
    cachedOutputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    eventCount: number;
    sessionCount: number;
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

    const now = new Date();
    const rowsToInsert = input.rows.map((row) => ({
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
      cachedOutputTokens: row.cachedOutputTokens,
      reasoningTokens: row.reasoningTokens,
      totalTokens: row.totalTokens,
      eventCount: row.eventCount,
      sessionCount: row.sessionCount,
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
          inputTokens: sql`excluded.input_tokens`,
          outputTokens: sql`excluded.output_tokens`,
          cachedInputTokens: sql`excluded.cached_input_tokens`,
          cachedOutputTokens: sql`excluded.cached_output_tokens`,
          reasoningTokens: sql`excluded.reasoning_tokens`,
          totalTokens: sql`excluded.total_tokens`,
          eventCount: sql`excluded.event_count`,
          sessionCount: sql`excluded.session_count`,
          attributionConfidence: sql`excluded.attribution_confidence`,
          ingestedAt: sql`excluded.ingested_at`,
          runId: sql`excluded.run_id`,
          updatedAt: now,
        },
      });

    return { upserted: input.rows.length };
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
