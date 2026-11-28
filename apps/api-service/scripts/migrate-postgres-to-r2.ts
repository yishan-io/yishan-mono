#!/usr/bin/env bun
/**
 * One-time migration of Postgres data into the R2 object store (see
 * architecture/postgres-removal-plan.md, sections 4.3 and 10).
 *
 * Reads Postgres with raw SQL (no drizzle schema import) and writes through the
 * store layer (`src/store`), so keys and record shapes always match the app.
 * User language/notification preferences are NOT migrated (they move to the daemon).
 *
 * Safe to re-run: users/indexes/orgs/tokens are put-if-absent, token usage is
 * merged with the max-wins rules, voice usage is set to max(existing, pg).
 *
 * Env:  DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *       (R2_* only needed with --apply / --verify)
 * Flags: --dry-run (default; writes into an in-memory bucket and prints counts)
 *        --apply  --usage-days N (default 90)  --verify (compare pg vs R2 counts)
 */
import { Client } from "pg";

import { type Stores, createStores } from "../src/store";
import { MemoryBlobBucket } from "../src/store/blob/memory-bucket";
import { S3BlobBucket } from "../src/store/blob/s3-bucket";
import type { BlobBucket } from "../src/store/blob/types";
import { normalizeEmail } from "../src/store/keys";
import type {
  OrganizationInviteRecord,
  OrganizationMemberRecord,
  OrganizationMemberRole,
  OrganizationPlan,
  OrganizationRecord,
  TokenUsageHourlyRow,
  UserRecord,
} from "../src/store/types";

type Row = Record<string, unknown>;
const counts: Record<string, number> = {};
const bump = (name: string, n = 1) => {
  counts[name] = (counts[name] ?? 0) + n;
};
const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
const isoOrNull = (v: unknown): string | null => (v ? iso(v) : null);
const num = (v: unknown): number => Number(v ?? 0);

function parseArgs(argv: string[]) {
  const days = argv.indexOf("--usage-days");
  return {
    apply: argv.includes("--apply"),
    verify: argv.includes("--verify"),
    usageDays: days >= 0 ? Number(argv[days + 1]) : 90,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

function createBucket(useR2: boolean): BlobBucket {
  if (!useR2) {
    return new MemoryBlobBucket();
  }
  return new S3BlobBucket({
    accountId: requireEnv("R2_ACCOUNT_ID"),
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("R2_BUCKET"),
  });
}

async function migrateUsers(pg: Client, stores: Stores): Promise<Row[]> {
  const { rows } = await pg.query(
    "select id, email, name, avatar_url, created_at, updated_at from users order by created_at",
  );
  const byEmail = new Map<string, string>();
  for (const r of rows) {
    const email = normalizeEmail(String(r.email));
    const clash = byEmail.get(email);
    if (clash && clash !== r.id) {
      throw new Error(`Case-insensitive email collision: users ${clash} and ${r.id} both map to ${email}`);
    }
    byEmail.set(email, String(r.id));
  }
  for (const r of rows) {
    const record: UserRecord = {
      id: r.id,
      email: String(r.email).trim(),
      name: r.name ?? null,
      avatarUrl: r.avatar_url ?? null,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    };
    const { created } = await stores.users.createIfAbsent(record);
    bump(created ? "users.created" : "users.existing");
    await stores.identities.linkEmailIfAbsent(record.email, record.id);
    bump("idx.email");
  }
  return rows;
}

async function migrateOAuth(pg: Client, stores: Stores): Promise<void> {
  const { rows } = await pg.query("select user_id, provider, provider_user_id from oauth_accounts");
  for (const r of rows) {
    await stores.identities.linkOAuthIfAbsent(r.provider, r.provider_user_id, r.user_id);
    bump("idx.oauth");
  }
}

async function loadOrganizations(pg: Client): Promise<Map<string, OrganizationRecord>> {
  const [orgs, members, invites] = await Promise.all([
    pg.query("select id, name, plan, created_at, updated_at from organizations order by created_at"),
    pg.query(
      `select m.organization_id, m.user_id, m.role, m.created_at, u.name, u.email, u.avatar_url
         from organization_members m join users u on u.id = m.user_id order by m.created_at`,
    ),
    pg.query(
      `select id, organization_id, email, role, invited_by_user_id, created_at, expires_at
         from organization_invitations where accepted_at is null and expires_at > now()`,
    ),
  ]);
  const result = new Map<string, OrganizationRecord>();
  for (const o of orgs.rows) {
    result.set(o.id, {
      id: o.id,
      name: o.name,
      plan: o.plan as OrganizationPlan,
      createdByUserId: "",
      createdAt: iso(o.created_at),
      updatedAt: iso(o.updated_at),
      members: [],
      invites: [],
    });
  }
  for (const m of members.rows) {
    const member: OrganizationMemberRecord = {
      userId: m.user_id,
      role: m.role as OrganizationMemberRole,
      name: m.name ?? null,
      email: m.email,
      avatarUrl: m.avatar_url ?? null,
      joinedAt: iso(m.created_at),
    };
    result.get(m.organization_id)?.members.push(member);
  }
  for (const i of invites.rows) {
    const invite: OrganizationInviteRecord = {
      id: i.id,
      email: normalizeEmail(i.email),
      role: i.role as OrganizationMemberRole,
      invitedByUserId: i.invited_by_user_id,
      createdAt: iso(i.created_at),
      expiresAt: iso(i.expires_at),
    };
    result.get(i.organization_id)?.invites.push(invite);
  }
  for (const org of result.values()) {
    org.createdByUserId = (org.members.find((m) => m.role === "owner") ?? org.members[0])?.userId ?? "";
  }
  return result;
}

async function migrateOrganizations(pg: Client, stores: Stores): Promise<Map<string, OrganizationRecord>> {
  const orgs = await loadOrganizations(pg);
  for (const org of orgs.values()) {
    const { created } = await stores.organizations.create(org);
    bump(created ? "orgs.created" : "orgs.existing");
    for (const member of org.members) {
      await stores.organizations.addUserOrganization(member.userId, org.id);
      bump("users.orgs.links");
    }
    for (const invite of org.invites) {
      await stores.organizations.addInvite(invite.email, org.id);
      bump("idx.invite");
    }
  }
  return orgs;
}

/** Earliest-created org the user belongs to, preferring ones they own. */
async function migrateDefaultOrgs(users: Row[], orgs: Map<string, OrganizationRecord>, stores: Stores): Promise<void> {
  for (const u of users) {
    const mine = [...orgs.values()]
      .filter((o) => o.members.some((m) => m.userId === u.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const owned = mine.filter((o) => o.members.some((m) => m.userId === u.id && m.role === "owner"));
    const pick = owned[0] ?? mine[0];
    if (pick) {
      await stores.users.setDefaultOrganizationIfUnset(String(u.id), pick.id);
      bump("users.defaultOrg");
    }
  }
}

async function migrateTokens(pg: Client, stores: Stores): Promise<void> {
  const sessions = await pg.query(
    "select id, user_id, token_hash, expires_at, created_at from sessions where expires_at > now()",
  );
  for (const s of sessions.rows) {
    await stores.authTokens.createSession({
      id: s.id,
      userId: s.user_id,
      tokenHash: s.token_hash,
      expiresAt: iso(s.expires_at),
      createdAt: iso(s.created_at),
    });
    bump("sessions");
  }
  const refresh = await pg.query(
    `select id, user_id, token_hash, expires_at, replaced_by_token_id, created_at
       from refresh_tokens where revoked_at is null and expires_at > now()`,
  );
  for (const t of refresh.rows) {
    await stores.authTokens.createRefresh({
      id: t.id,
      userId: t.user_id,
      tokenHash: t.token_hash,
      expiresAt: iso(t.expires_at),
      revokedAt: null,
      replacedByTokenId: t.replaced_by_token_id ?? null,
      createdAt: iso(t.created_at),
    });
    bump("refreshTokens");
  }
}

/** Scope rule: premium orgs are counted per org, pro orgs per (org, user); free has no quota. */
async function migrateVoice(pg: Client, stores: Stores): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  const { rows } = await pg.query(
    `select a.organization_id, a.user_id, o.plan, coalesce(sum(a.duration_seconds), 0)::int as seconds, count(*)::int as requests
       from voice_usage_activities a join organizations o on o.id = a.organization_id
      where a.status = 'succeeded' and a.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
        and o.plan in ('pro', 'premium')
      group by a.organization_id, a.user_id, o.plan`,
  );
  const premium = new Map<string, { seconds: number; requests: number }>();
  for (const r of rows) {
    if (r.plan === "pro") {
      await stores.voiceQuota.raiseTo({ orgId: r.organization_id, userId: r.user_id }, month, {
        seconds: num(r.seconds),
        requests: num(r.requests),
      });
      bump("voice.pro");
    } else {
      const acc = premium.get(r.organization_id) ?? { seconds: 0, requests: 0 };
      acc.seconds += num(r.seconds);
      acc.requests += num(r.requests);
      premium.set(r.organization_id, acc);
    }
  }
  for (const [orgId, usage] of premium) {
    await stores.voiceQuota.raiseTo({ orgId }, month, usage);
    bump("voice.premium");
  }
}

function toUsageRow(r: Row): TokenUsageHourlyRow {
  return {
    projectId: r.project_id as string,
    workspaceId: r.workspace_id as string,
    workspacePath: r.workspace_path as string,
    agentKind: r.agent_kind as string,
    model: r.model as string,
    modelNormalized: r.model_normalized as string,
    bucketStartHourUtc: iso(r.bucket_start_hour_utc),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cachedInputTokens: num(r.cached_input_tokens),
    cachedWriteTokens: num(r.cached_write_tokens),
    reasoningTokens: num(r.reasoning_tokens),
    totalTokens: num(r.total_tokens),
    totalCostMicrosUsd: num(r.total_cost_micros_usd),
    costSource: r.cost_source as TokenUsageHourlyRow["costSource"],
    eventCount: num(r.event_count),
    sessionCount: num(r.session_count),
    turnCount: num(r.turn_count),
    toolCallCount: num(r.tool_call_count),
    attributionConfidence: r.attribution_confidence as TokenUsageHourlyRow["attributionConfidence"],
    ingestedAt: iso(r.ingested_at),
    runId: r.run_id as string,
  };
}

async function migrateUsage(pg: Client, stores: Stores, days: number): Promise<void> {
  const { rows } = await pg.query(
    `select t.*, w.user_id as workspace_user_id
       from token_usage_hourly t left join workspaces w on w.id = t.workspace_id
      where t.bucket_start_hour_utc >= now() - ($1::int * interval '1 day')
      order by t.organization_id, t.bucket_start_hour_utc`,
    [days],
  );
  type UsageGroup = { orgId: string; userId: string; day: string; rows: TokenUsageHourlyRow[] };
  const groups = new Map<string, UsageGroup>();
  for (const r of rows) {
    if (!r.workspace_user_id) {
      bump("usage.skippedNoWorkspace");
      continue;
    }
    const row = toUsageRow(r);
    const day = row.bucketStartHourUtc.slice(0, 10);
    const key = `${r.organization_id}|${day}|${r.workspace_user_id}`;
    const group: UsageGroup = groups.get(key) ?? {
      orgId: r.organization_id,
      userId: r.workspace_user_id,
      day,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
    bump("usage.rows");
  }
  for (const g of groups.values()) {
    await stores.tokenUsage.mergeRows(g.orgId, g.userId, g.day, g.rows);
    bump("usage.objects");
  }
}

async function countKeys(bucket: BlobBucket, prefix: string, pattern?: RegExp): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list(prefix, cursor);
    total += pattern ? page.keys.filter((k) => pattern.test(k)).length : page.keys.length;
    cursor = page.cursor;
  } while (cursor);
  return total;
}

async function pgCount(pg: Client, sql: string): Promise<number> {
  return Number((await pg.query(sql)).rows[0].count);
}

async function verify(pg: Client, bucket: BlobBucket): Promise<boolean> {
  const checks: Array<[string, number, number]> = [
    [
      "users",
      await pgCount(pg, "select count(*) from users"),
      await countKeys(bucket, "users/", /^users\/[^/]+\.json$/),
    ],
    ["oauth index", await pgCount(pg, "select count(*) from oauth_accounts"), await countKeys(bucket, "idx/oauth/")],
    ["orgs", await pgCount(pg, "select count(*) from organizations"), await countKeys(bucket, "orgs/")],
    [
      "sessions",
      await pgCount(pg, "select count(*) from sessions where expires_at > now()"),
      await countKeys(bucket, "auth/session/"),
    ],
    [
      "refresh tokens",
      await pgCount(pg, "select count(*) from refresh_tokens where revoked_at is null and expires_at > now()"),
      await countKeys(bucket, "auth/refresh/"),
    ],
  ];
  let ok = true;
  for (const [name, expected, actual] of checks) {
    // R2 may legitimately hold more (users/orgs created after cutover); fewer means data is missing.
    const pass = actual >= expected;
    ok &&= pass;
    console.log(`${pass ? "OK  " : "FAIL"} ${name}: postgres=${expected} r2=${actual}`);
  }
  return ok;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const bucket = createBucket(args.apply || args.verify);
  const pg = new Client({ connectionString: requireEnv("DATABASE_URL") });
  await pg.connect();
  try {
    if (args.verify) {
      process.exitCode = (await verify(pg, bucket)) ? 0 : 1;
      return;
    }
    console.log(args.apply ? "APPLY: writing to R2" : "DRY RUN: writing to an in-memory bucket only");
    const stores = createStores(bucket);
    const users = await migrateUsers(pg, stores);
    await migrateOAuth(pg, stores);
    const orgs = await migrateOrganizations(pg, stores);
    await migrateDefaultOrgs(users, orgs, stores);
    await migrateTokens(pg, stores);
    await migrateVoice(pg, stores);
    await migrateUsage(pg, stores, args.usageDays);
    console.table(counts);
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
