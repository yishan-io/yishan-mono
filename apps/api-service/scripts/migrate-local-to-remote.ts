#!/usr/bin/env bun
/**
 * Migrate local daemon data (workspaces + hourly token usage) directly into
 * the remote Postgres that backs the API service.
 *
 * Why direct DB writes instead of the API: the API rejects/soft-drops writes
 * that the local daemon could not complete at the time (e.g. the collector's
 * upload silently drops usage rows for workspaces the remote does not know,
 * while the daemon still marks them synced). A direct backfill restores those
 * rows and any workspace records that were never created remotely.
 *
 * Semantics (mirror the API service exactly):
 *   - Workspaces: insert-only. Rows whose id already exists, or that would
 *     violate the live-unique index (project/user/node/kind/branch), are
 *     skipped via ON CONFLICT DO NOTHING — the remote record stays intact.
 *   - Usage: upsert with the same max-wins merge as TokenUsageService:
 *     the side with the higher totalTokens wins per field; ties break by cost
 *     source rank (direct > estimated > unknown); an estimated backfill with
 *     cost 0 never clobbers an existing positive remote cost.
 *
 * Safety: dry-run by default. Pass --apply to write.
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host:5432/db bun run scripts/migrate-local-to-remote.ts \
 *     --sqlite ~/.yishan/profiles/default/accounts/<userId>/yishan.db \
 *     [--user-id <id>] [--apply] [--stage all|workspaces|usage] [--org <orgId>]
 *
 * --user-id defaults to the user_id recorded in the profile's credential.yaml
 * (the profile dir is two levels above the account dir holding the SQLite file).
 */
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type SQL, type SQLWrapper, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

import {
  type NewTokenUsageHourly,
  type NewWorkspace,
  nodes,
  organizations,
  projects,
  tokenUsageHourly,
  users,
  workspaces,
} from "../src/db/schema";
import { newId } from "../src/lib/id";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LocalWorkspaceRow = {
  id: string;
  organization_id: string;
  project_id: string;
  node_id: string;
  kind: string;
  status: string;
  branch: string | null;
  source_branch: string | null;
  local_path: string;
  state: string;
  health: string | null;
  created_at: string;
  updated_at: string;
};

type LocalUsageRow = {
  project_id: string;
  workspace_id: string;
  workspace_path: string;
  organization_id: string;
  agent_kind: string;
  model: string;
  model_normalized: string;
  bucket_start_hour_utc: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cached_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  total_cost_micros_usd: number;
  cost_source: string;
  event_count: number;
  session_count: number;
  turn_count: number;
  tool_call_count: number;
  attribution_confidence: string;
  ingested_at: number;
  run_id: string;
};

type StageResult = {
  table: string;
  total: number;
  skippedMissingDependency: number;
  alreadyRemote: number;
  written: number;
  merged: number;
  failed: string[];
};

type CliArgs = {
  sqlitePath: string;
  databaseUrl: string;
  userId: string;
  apply: boolean;
  stage: "all" | "workspaces" | "usage";
  orgFilter: string;
};

const workspaceColumns =
  "id, organization_id, project_id, node_id, kind, status, branch, source_branch, local_path, state, health, created_at, updated_at";

const usageColumns =
  "project_id, workspace_id, workspace_path, organization_id, agent_kind, model, model_normalized, bucket_start_hour_utc, " +
  "input_tokens, output_tokens, cached_input_tokens, cached_write_tokens, reasoning_tokens, total_tokens, " +
  "total_cost_micros_usd, cost_source, event_count, session_count, turn_count, tool_call_count, " +
  "attribution_confidence, ingested_at, run_id";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function flagValue(name: string): string | undefined {
  const args = process.argv.slice(2);
  const prefix = `--${name}=`;
  const inline = args.find((value) => value.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = args.indexOf(`--${name}`);
  const next = args[index + 1];
  if (index >= 0 && next !== undefined && !next.startsWith("--")) {
    return next;
  }
  return undefined;
}

function parseArgs(): CliArgs {
  const sqlitePath = flagValue("sqlite") ?? process.env.YISHAN_LOCAL_DB;
  if (!sqlitePath) {
    throw new Error("missing --sqlite <path>: local daemon database (yishan.db)");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("missing DATABASE_URL: target Postgres backing the API service");
  }
  const stage = (flagValue("stage") ?? "all") as CliArgs["stage"];
  if (!["all", "workspaces", "usage"].includes(stage)) {
    throw new Error(`invalid --stage ${stage}: expected all|workspaces|usage`);
  }
  const userId = flagValue("user-id") ?? readUserIdFromCredential(sqlitePath);
  if (!userId) {
    throw new Error("missing --user-id: pass the user id workspaces should be attributed to");
  }
  return {
    sqlitePath,
    databaseUrl,
    userId,
    apply: process.argv.includes("--apply"),
    stage,
    orgFilter: flagValue("org") ?? "",
  };
}

/** Reads user_id from <profile>/credential.yaml (profile dir = 2 levels above the account dir). */
function readUserIdFromCredential(sqlitePath: string): string {
  const accountDir = dirname(sqlitePath);
  const credentialPath = join(dirname(dirname(accountDir)), "credential.yaml");
  try {
    const content = readFileSync(credentialPath, "utf8");
    const match = content.match(/^\s*user_id\s*:\s*(\S+)\s*$/m);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Date helpers (local SQLite stores mixed formats: ISO-8601 and SQLite datetime)
// ---------------------------------------------------------------------------

function parseSqliteDate(value: string): Date {
  if (value.includes("T")) {
    return new Date(value);
  }
  return new Date(`${value.replace(" ", "T")}Z`);
}

// ---------------------------------------------------------------------------
// Max-wins merge (mirror of TokenUsageService.upsertHourly)
// ---------------------------------------------------------------------------

function costRank(column: SQLWrapper): SQL {
  return sql`CASE ${column} WHEN 'direct' THEN 3 WHEN 'estimated' THEN 2 ELSE 1 END`;
}

/**
 * Builds the per-field upsert expression: keep the existing remote value when
 * the remote totalTokens is higher (or equal with a better cost source), keep
 * a positive remote estimated cost over an incoming 0-cost backfill, otherwise
 * take the incoming value.
 */
function maxWinField(remoteColumn: SQLWrapper, excludedColumn: string): SQL {
  return sql`CASE
    WHEN ${tokenUsageHourly.totalTokens} > ${sql.raw("excluded.total_tokens")} THEN ${remoteColumn}
    WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
      AND ${costRank(tokenUsageHourly.costSource)} > ${costRank(sql.raw("excluded.cost_source"))} THEN ${remoteColumn}
    WHEN ${tokenUsageHourly.totalTokens} = ${sql.raw("excluded.total_tokens")}
      AND ${tokenUsageHourly.costSource} = ${sql.raw("excluded.cost_source")}
      AND ${tokenUsageHourly.costSource} = 'estimated'
      AND ${sql.raw("excluded.total_cost_micros_usd")} = 0
      AND ${tokenUsageHourly.totalCostMicrosUsd} > 0 THEN ${remoteColumn}
    ELSE ${sql.raw(excludedColumn)}
  END`;
}

// ---------------------------------------------------------------------------
// Local data loading
// ---------------------------------------------------------------------------

function loadLocalWorkspaces(db: Database, orgFilter: string): LocalWorkspaceRow[] {
  const rows = db
    .query(`SELECT ${workspaceColumns} FROM workspaces ORDER BY created_at, id`)
    .all() as LocalWorkspaceRow[];
  return orgFilter ? rows.filter((row) => row.organization_id === orgFilter) : rows;
}

function loadLocalUsage(db: Database, orgFilter: string): LocalUsageRow[] {
  const rows = db
    .query(`SELECT ${usageColumns} FROM token_usage_hourly ORDER BY bucket_start_hour_utc`)
    .all() as LocalUsageRow[];
  return orgFilter ? rows.filter((row) => row.organization_id === orgFilter) : rows;
}

// ---------------------------------------------------------------------------
// Migration stages
// ---------------------------------------------------------------------------

type Preflight = {
  orgIds: Set<string>;
  userId: string;
  nodeIds: Set<string>;
  projectIds: Set<string>;
  workspaceByID: Map<string, { projectId: string; organizationId: string }>;
};

const remoteSchema = { workspaces, tokenUsageHourly, organizations, nodes, projects, users } as const;
type AppDb = ReturnType<typeof buildDb>;
function buildDb(client: Client) {
  return drizzle({ client, schema: remoteSchema });
}

async function preflight(
  db: AppDb,
  userId: string,
  workspacesRows: LocalWorkspaceRow[],
  usageRows: LocalUsageRow[],
): Promise<Preflight> {
  const orgIds = new Set([
    ...workspacesRows.map((row) => row.organization_id),
    ...usageRows.map((row) => row.organization_id),
  ]);
  const nodeIds = new Set(workspacesRows.map((row) => row.node_id));
  const projectIds = new Set(workspacesRows.map((row) => row.project_id));

  const orgRows = orgIds.size
    ? await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(inArray(organizations.id, [...orgIds]))
    : [];
  const userRows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  const nodeRows = nodeIds.size
    ? await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(inArray(nodes.id, [...nodeIds]))
    : [];
  const projectRows = projectIds.size
    ? await db
        .select({ id: projects.id })
        .from(projects)
        .where(inArray(projects.id, [...projectIds]))
    : [];
  const workspaceRows = await db
    .select({ id: workspaces.id, projectId: workspaces.projectId, organizationId: workspaces.organizationId })
    .from(workspaces);

  return {
    orgIds: new Set(orgRows.map((row) => row.id)),
    userId,
    nodeIds: new Set(nodeRows.map((row) => row.id)),
    projectIds: new Set(projectRows.map((row) => row.id)),
    workspaceByID: new Map(
      workspaceRows.map((row) => [row.id, { projectId: row.projectId, organizationId: row.organizationId }]),
    ),
  };
}

function workspaceDependencyError(preflightState: Preflight, row: LocalWorkspaceRow): string | null {
  if (!preflightState.orgIds.has(row.organization_id)) {
    return `organization ${row.organization_id} does not exist in target`;
  }
  if (!preflightState.nodeIds.has(row.node_id)) {
    return `node ${row.node_id} does not exist in target`;
  }
  if (!preflightState.projectIds.has(row.project_id)) {
    return `project ${row.project_id} does not exist in target`;
  }
  return null;
}

function toRemoteWorkspace(row: LocalWorkspaceRow, userId: string): NewWorkspace {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    userId,
    nodeId: row.node_id,
    kind: row.kind as NewWorkspace["kind"],
    status: row.status as NewWorkspace["status"],
    branch: row.branch,
    sourceBranch: row.source_branch,
    localPath: row.local_path,
    createdAt: parseSqliteDate(row.created_at),
    updatedAt: parseSqliteDate(row.updated_at),
  };
}

async function migrateWorkspaces(
  db: AppDb,
  preflightState: Preflight,
  rows: LocalWorkspaceRow[],
  apply: boolean,
  log: (message: string) => void,
): Promise<{ result: StageResult; writtenWorkspaceIDs: string[] }> {
  const result: StageResult = {
    table: "workspaces",
    total: rows.length,
    skippedMissingDependency: 0,
    alreadyRemote: 0,
    written: 0,
    merged: 0,
    failed: [],
  };

  const toInsert: NewWorkspace[] = [];
  const plannedIDs: string[] = [];
  for (const row of rows) {
    if (workspaceDependencyError(preflightState, row)) {
      result.skippedMissingDependency++;
      continue;
    }
    if (preflightState.workspaceByID.has(row.id)) {
      result.alreadyRemote++;
      continue;
    }
    toInsert.push(toRemoteWorkspace(row, preflightState.userId));
    plannedIDs.push(row.id);
  }

  if (!apply) {
    log(
      `would insert ${toInsert.length} workspaces (${result.alreadyRemote} already remote, ${result.skippedMissingDependency} missing FK deps)`,
    );
    return { result, writtenWorkspaceIDs: plannedIDs };
  }
  if (toInsert.length === 0) {
    return { result, writtenWorkspaceIDs: [] };
  }

  const inserted = await db.transaction(async (tx) =>
    tx.insert(workspaces).values(toInsert).onConflictDoNothing().returning({ id: workspaces.id }),
  );
  result.written = inserted.length;
  const writtenWorkspaceIDs = inserted.map((row) => row.id);
  log(`inserted ${inserted.length} of ${toInsert.length} workspaces (rest skipped via ON CONFLICT DO NOTHING)`);
  return { result, writtenWorkspaceIDs };
}

function usageWorkspaceMatches(preflightState: Preflight, row: LocalUsageRow): boolean {
  const workspace = preflightState.workspaceByID.get(row.workspace_id);
  return Boolean(
    workspace && workspace.projectId === row.project_id && workspace.organizationId === row.organization_id,
  );
}

function toRemoteUsageRow(row: LocalUsageRow): NewTokenUsageHourly {
  const now = new Date();
  return {
    id: newId(),
    organizationId: row.organization_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    workspacePath: row.workspace_path,
    agentKind: row.agent_kind as NewTokenUsageHourly["agentKind"],
    model: row.model,
    modelNormalized: row.model_normalized,
    bucketStartHourUtc: new Date(row.bucket_start_hour_utc),
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedInputTokens: row.cached_input_tokens,
    cachedWriteTokens: row.cached_write_tokens,
    reasoningTokens: row.reasoning_tokens,
    totalTokens: row.total_tokens,
    totalCostMicrosUsd: row.total_cost_micros_usd,
    costSource: (row.cost_source || "unknown") as NewTokenUsageHourly["costSource"],
    eventCount: row.event_count,
    sessionCount: row.session_count,
    turnCount: row.turn_count,
    toolCallCount: row.tool_call_count,
    attributionConfidence: row.attribution_confidence as NewTokenUsageHourly["attributionConfidence"],
    ingestedAt: new Date(row.ingested_at),
    runId: row.run_id,
    updatedAt: now,
  };
}

async function migrateUsage(
  db: AppDb,
  preflightState: Preflight,
  rows: LocalUsageRow[],
  apply: boolean,
  log: (message: string) => void,
): Promise<StageResult> {
  const result: StageResult = {
    table: "token_usage_hourly",
    total: rows.length,
    skippedMissingDependency: 0,
    alreadyRemote: 0,
    written: 0,
    merged: 0,
    failed: [],
  };

  const toUpsert: NewTokenUsageHourly[] = [];
  for (const row of rows) {
    if (!usageWorkspaceMatches(preflightState, row)) {
      result.skippedMissingDependency++;
      continue;
    }
    toUpsert.push(toRemoteUsageRow(row));
  }

  if (!apply) {
    log(
      `would upsert ${toUpsert.length} usage rows (${result.skippedMissingDependency} skipped: workspace record missing on remote)`,
    );
    return result;
  }
  if (toUpsert.length === 0) {
    return result;
  }

  const now = new Date();
  const upserted = await db.transaction(async (tx) =>
    tx
      .insert(tokenUsageHourly)
      .values(toUpsert)
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
          inputTokens: maxWinField(tokenUsageHourly.inputTokens, "excluded.input_tokens"),
          outputTokens: maxWinField(tokenUsageHourly.outputTokens, "excluded.output_tokens"),
          cachedInputTokens: maxWinField(tokenUsageHourly.cachedInputTokens, "excluded.cached_input_tokens"),
          cachedWriteTokens: maxWinField(tokenUsageHourly.cachedWriteTokens, "excluded.cached_write_tokens"),
          reasoningTokens: maxWinField(tokenUsageHourly.reasoningTokens, "excluded.reasoning_tokens"),
          totalTokens: maxWinField(tokenUsageHourly.totalTokens, "excluded.total_tokens"),
          totalCostMicrosUsd: maxWinField(tokenUsageHourly.totalCostMicrosUsd, "excluded.total_cost_micros_usd"),
          costSource: maxWinField(tokenUsageHourly.costSource, "excluded.cost_source"),
          eventCount: maxWinField(tokenUsageHourly.eventCount, "excluded.event_count"),
          sessionCount: maxWinField(tokenUsageHourly.sessionCount, "excluded.session_count"),
          turnCount: maxWinField(tokenUsageHourly.turnCount, "excluded.turn_count"),
          toolCallCount: maxWinField(tokenUsageHourly.toolCallCount, "excluded.tool_call_count"),
          attributionConfidence: sql`excluded.attribution_confidence`,
          ingestedAt: sql`excluded.ingested_at`,
          runId: sql`excluded.run_id`,
          updatedAt: now,
        },
      })
      .returning({ id: tokenUsageHourly.id, inserted: sql<number>`(xmax = 0)::int` }),
  );
  result.written = upserted.length;
  result.merged = upserted.length - upserted.filter((row) => row.inserted === 1).length;
  log(
    `upserted ${upserted.length} of ${toUpsert.length} usage rows (${upserted.filter((row) => row.inserted === 1).length} new, ${result.merged} already present / merged)`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printStageResult(result: StageResult, mode: string): void {
  console.log(`  ${result.table}:`);
  console.log(`    local rows:               ${result.total}`);
  console.log(`    skipped (FK dep missing): ${result.skippedMissingDependency}`);
  if (mode === "dry-run") {
    console.log(`    to write:                 ${result.written}`);
  } else if (result.table === "token_usage_hourly") {
    console.log(
      `    upserted:                 ${result.written} (${result.written - result.merged} new, ${result.merged} merged)`,
    );
  } else {
    console.log(`    already remote / written: ${result.alreadyRemote} / ${result.written}`);
  }
  if (result.failed.length > 0) {
    console.log(`    failures (${result.failed.length}):`);
    for (const failure of result.failed.slice(0, 10)) {
      console.log(`      - ${failure}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const source = new Database(args.sqlitePath, { readonly: true });

  const workspacesRows = loadLocalWorkspaces(source, args.orgFilter);
  const usageRows = loadLocalUsage(source, args.orgFilter);

  const client = new Client({ connectionString: args.databaseUrl });
  await client.connect();
  const db = buildDb(client);

  const mode = args.apply ? "apply" : "dry-run";
  console.log("=== migrate-local-to-remote ===");
  console.log(`source sqlite: ${args.sqlitePath}`);
  console.log(`target:        ${client.host}:${client.port}/${client.database}`);
  console.log(`user id:       ${args.userId}`);
  console.log(`mode:          ${mode}${mode === "dry-run" ? " (pass --apply to write)" : ""}`);
  console.log(`stage:         ${args.stage}`);
  console.log(
    `orgs in scope: ${[...new Set([...workspacesRows.map((row) => row.organization_id), ...usageRows.map((row) => row.organization_id)])].join(", ") || "(none)"}`,
  );
  console.log();

  try {
    const preflightState = await preflight(db, args.userId, workspacesRows, usageRows);
    const log = (message: string) => console.log(`  ${message}`);

    if (args.stage !== "usage") {
      const { result, writtenWorkspaceIDs } = await migrateWorkspaces(
        db,
        preflightState,
        workspacesRows,
        args.apply,
        log,
      );
      printStageResult(result, mode);
      // Let the usage stage see the workspaces this run created (or would
      // create) so their usage rows are not skipped as "missing on remote".
      if (args.stage === "all" && writtenWorkspaceIDs.length > 0) {
        const localByID = new Map(workspacesRows.map((row) => [row.id, row]));
        for (const id of writtenWorkspaceIDs) {
          const local = localByID.get(id);
          if (local) {
            preflightState.workspaceByID.set(id, {
              projectId: local.project_id,
              organizationId: local.organization_id,
            });
          }
        }
      }
    }
    if (args.stage !== "workspaces") {
      const result = await migrateUsage(db, preflightState, usageRows, args.apply, log);
      printStageResult(result, mode);
    }
  } finally {
    await client.end();
    source.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`migration failed: ${message}`);
  if (/pg_hba\.conf|no encryption/i.test(message)) {
    console.error(
      "hint: the target Postgres rejected the non-SSL connection — add ?sslmode=require (or sslmode=verify-full with the CA bundle) to DATABASE_URL",
    );
  }
  if (/self signed certificate|certificate chain|unable to verify/i.test(message)) {
    console.error(
      "hint: the server uses a self-signed/private CA certificate — pass its CA with sslrootcert=... (sslmode=verify-full), or use ?sslmode=require&uselibpqcompat=true for TLS without certificate verification",
    );
  }
  process.exit(1);
});
