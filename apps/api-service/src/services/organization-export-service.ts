import { and, eq, inArray } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { nodes, projects, tokenUsageHourly, workspaces } from "@/db/schema";
import type { OrganizationMemberRole } from "@/db/schema";
import type { OrganizationService } from "@/services/organization-service";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";

const csvContentType = "text/csv; charset=utf-8";
const projectsFileSuffix = "projects";
const workspacesFileSuffix = "workspaces";
const tokenUsageHourlyFileSuffix = "token-usage-hourly";

const projectHeaders = [
  "id",
  "name",
  "sourceType",
  "repoProvider",
  "repoUrl",
  "repoKey",
  "icon",
  "color",
  "setupScript",
  "postScript",
  "commands",
  "contextEnabled",
  "organizationId",
  "createdByUserId",
  "createdAt",
  "updatedAt",
] as const;

const workspaceHeaders = [
  "id",
  "organizationId",
  "projectId",
  "userId",
  "nodeId",
  "kind",
  "status",
  "branch",
  "sourceBranch",
  "localPath",
  "createdAt",
  "updatedAt",
] as const;

const tokenUsageHourlyHeaders = [
  "id",
  "organizationId",
  "projectId",
  "workspaceId",
  "workspacePath",
  "agentKind",
  "model",
  "modelNormalized",
  "bucketStartHourUtc",
  "inputTokens",
  "outputTokens",
  "cachedInputTokens",
  "cachedWriteTokens",
  "reasoningTokens",
  "totalTokens",
  "totalCostMicrosUsd",
  "costSource",
  "eventCount",
  "sessionCount",
  "turnCount",
  "toolCallCount",
  "attributionConfidence",
  "ingestedAt",
  "runId",
  "createdAt",
  "updatedAt",
] as const;

type ExportInput = {
  organizationId: string;
  actorUserId: string;
  actorRole?: OrganizationMemberRole;
};

type CsvExportFile = {
  fileName: string;
  contentType: string;
  body: string;
};

/** Builds downloadable CSV exports for organization-scoped data. */
export class OrganizationExportService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  async exportProjectsCsv(input: ExportInput): Promise<CsvExportFile> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    const ownedProjectIDs = await this.listOwnedProjectIDs(input);
    if (ownedProjectIDs.length === 0) {
      return buildCsvExportFile(input.organizationId, projectsFileSuffix, projectHeaders, []);
    }

    const rows = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        sourceType: projects.sourceType,
        repoProvider: projects.repoProvider,
        repoUrl: projects.repoUrl,
        repoKey: projects.repoKey,
        icon: projects.icon,
        color: projects.color,
        setupScript: projects.setupScript,
        postScript: projects.postScript,
        commands: projects.commands,
        contextEnabled: projects.contextEnabled,
        organizationId: projects.organizationId,
        createdByUserId: projects.createdByUserId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(and(eq(projects.organizationId, input.organizationId), inArray(projects.id, ownedProjectIDs)));

    return buildCsvExportFile(
      input.organizationId,
      projectsFileSuffix,
      projectHeaders,
      rows.map((row) => [
        row.id,
        row.name,
        row.sourceType,
        row.repoProvider,
        row.repoUrl,
        row.repoKey,
        row.icon,
        row.color,
        row.setupScript,
        row.postScript,
        row.commands,
        row.contextEnabled,
        row.organizationId,
        row.createdByUserId,
        row.createdAt,
        row.updatedAt,
      ]),
    );
  }

  async exportWorkspacesCsv(input: ExportInput): Promise<CsvExportFile> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    const ownedNodeIDs = await this.listOwnedNodeIDs(input.actorUserId);
    if (ownedNodeIDs.length === 0) {
      return buildCsvExportFile(input.organizationId, workspacesFileSuffix, workspaceHeaders, []);
    }

    const rows = await this.db
      .select({
        id: workspaces.id,
        organizationId: workspaces.organizationId,
        projectId: workspaces.projectId,
        userId: workspaces.userId,
        nodeId: workspaces.nodeId,
        kind: workspaces.kind,
        status: workspaces.status,
        branch: workspaces.branch,
        sourceBranch: workspaces.sourceBranch,
        localPath: workspaces.localPath,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
      })
      .from(workspaces)
      .where(and(eq(workspaces.organizationId, input.organizationId), inArray(workspaces.nodeId, ownedNodeIDs)));

    return buildCsvExportFile(
      input.organizationId,
      workspacesFileSuffix,
      workspaceHeaders,
      rows.map((row) => [
        row.id,
        row.organizationId,
        row.projectId,
        row.userId,
        row.nodeId,
        row.kind,
        row.status,
        row.branch,
        row.sourceBranch,
        row.localPath,
        row.createdAt,
        row.updatedAt,
      ]),
    );
  }

  async exportTokenUsageHourlyCsv(input: ExportInput): Promise<CsvExportFile> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId, input.actorRole);

    const ownedWorkspaceIDs = await this.listOwnedWorkspaceIDs(input);
    if (ownedWorkspaceIDs.length === 0) {
      return buildCsvExportFile(input.organizationId, tokenUsageHourlyFileSuffix, tokenUsageHourlyHeaders, []);
    }

    const rows = await this.db
      .select({
        id: tokenUsageHourly.id,
        organizationId: tokenUsageHourly.organizationId,
        projectId: tokenUsageHourly.projectId,
        workspaceId: tokenUsageHourly.workspaceId,
        workspacePath: tokenUsageHourly.workspacePath,
        agentKind: tokenUsageHourly.agentKind,
        model: tokenUsageHourly.model,
        modelNormalized: tokenUsageHourly.modelNormalized,
        bucketStartHourUtc: tokenUsageHourly.bucketStartHourUtc,
        inputTokens: tokenUsageHourly.inputTokens,
        outputTokens: tokenUsageHourly.outputTokens,
        cachedInputTokens: tokenUsageHourly.cachedInputTokens,
        cachedWriteTokens: tokenUsageHourly.cachedWriteTokens,
        reasoningTokens: tokenUsageHourly.reasoningTokens,
        totalTokens: tokenUsageHourly.totalTokens,
        totalCostMicrosUsd: tokenUsageHourly.totalCostMicrosUsd,
        costSource: tokenUsageHourly.costSource,
        eventCount: tokenUsageHourly.eventCount,
        sessionCount: tokenUsageHourly.sessionCount,
        turnCount: tokenUsageHourly.turnCount,
        toolCallCount: tokenUsageHourly.toolCallCount,
        attributionConfidence: tokenUsageHourly.attributionConfidence,
        ingestedAt: tokenUsageHourly.ingestedAt,
        runId: tokenUsageHourly.runId,
        createdAt: tokenUsageHourly.createdAt,
        updatedAt: tokenUsageHourly.updatedAt,
      })
      .from(tokenUsageHourly)
      .where(
        and(
          eq(tokenUsageHourly.organizationId, input.organizationId),
          inArray(tokenUsageHourly.workspaceId, ownedWorkspaceIDs),
        ),
      );

    return buildCsvExportFile(
      input.organizationId,
      tokenUsageHourlyFileSuffix,
      tokenUsageHourlyHeaders,
      rows.map((row) => [
        row.id,
        row.organizationId,
        row.projectId,
        row.workspaceId,
        row.workspacePath,
        row.agentKind,
        row.model,
        row.modelNormalized,
        row.bucketStartHourUtc,
        row.inputTokens,
        row.outputTokens,
        row.cachedInputTokens,
        row.cachedWriteTokens,
        row.reasoningTokens,
        row.totalTokens,
        row.totalCostMicrosUsd,
        row.costSource,
        row.eventCount,
        row.sessionCount,
        row.turnCount,
        row.toolCallCount,
        row.attributionConfidence,
        row.ingestedAt,
        row.runId,
        row.createdAt,
        row.updatedAt,
      ]),
    );
  }

  private async listOwnedNodeIDs(actorUserId: string): Promise<string[]> {
    const rows = await this.db.select({ id: nodes.id }).from(nodes).where(eq(nodes.ownerUserId, actorUserId));
    return rows.map((row) => row.id);
  }

  private async listOwnedWorkspaceIDs(input: ExportInput): Promise<string[]> {
    const rows = await this.listOwnedWorkspaceRows(input);
    return rows.map((row) => row.id);
  }

  private async listOwnedProjectIDs(input: ExportInput): Promise<string[]> {
    const rows = await this.listOwnedWorkspaceRows(input);
    return [...new Set(rows.map((row) => row.projectId))];
  }

  private async listOwnedWorkspaceRows(input: ExportInput): Promise<Array<{ id: string; projectId: string }>> {
    const ownedNodeIDs = await this.listOwnedNodeIDs(input.actorUserId);
    if (ownedNodeIDs.length === 0) {
      return [];
    }

    return this.db
      .select({ id: workspaces.id, projectId: workspaces.projectId })
      .from(workspaces)
      .where(and(eq(workspaces.organizationId, input.organizationId), inArray(workspaces.nodeId, ownedNodeIDs)));
  }
}

function buildCsvExportFile(
  organizationId: string,
  fileSuffix: string,
  headers: readonly string[],
  rows: Array<readonly unknown[]>,
): CsvExportFile {
  return {
    fileName: `${buildOrganizationFilePrefix(organizationId)}-${fileSuffix}.csv`,
    contentType: csvContentType,
    body: buildCsvDocument(headers, rows),
  };
}

function buildOrganizationFilePrefix(organizationId: string): string {
  const safeOrganizationId = organizationId.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `organization-${safeOrganizationId}`;
}

function buildCsvDocument(headers: readonly string[], rows: Array<readonly unknown[]>): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map((value) => escapeCsvValue(formatCsvValue(value))).join(","));
  }
  return lines.join("\n");
}

function formatCsvValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function escapeCsvValue(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}
