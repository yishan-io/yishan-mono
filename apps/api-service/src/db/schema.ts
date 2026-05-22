import type { AgentKind } from "@yishan/core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type NodeScope = "private" | "shared";
export type OrganizationMemberRole = "owner" | "admin" | "member";
export type ProjectSourceType = "git" | "git-local" | "unknown";
export type WorkspaceKind = "primary" | "worktree";
export type WorkspaceStatus = "active" | "closed";
export type WorkspacePullRequestState = "open" | "closed" | "merged";
export type ScheduledJobStatus = "active" | "paused" | "disabled" | "deleted";
export type ScheduledAgentKind = AgentKind;
export type ScheduledJobRunStatus = "pending" | "running" | "succeeded" | "failed" | "skipped_offline";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  userPreferences: jsonb("user_preferences"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("oauth_accounts_provider_provider_user_id_uq").on(table.provider, table.providerUserId),
    uniqueIndex("oauth_accounts_user_id_provider_uq").on(table.userId, table.provider),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uq").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedByTokenId: text("replaced_by_token_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("refresh_tokens_token_hash_uq").on(table.tokenHash),
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("organizations_created_at_idx").on(table.createdAt)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_members_org_id_user_id_uq").on(table.organizationId, table.userId),
    index("organization_members_org_id_idx").on(table.organizationId),
    index("organization_members_user_id_idx").on(table.userId),
  ],
);

export const nodes = pgTable(
  "nodes",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    scope: text("scope").$type<NodeScope>().notNull(),
    endpoint: text("endpoint"),
    metadata: jsonb("metadata"),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("nodes_scope_idx").on(table.scope),
    index("nodes_owner_user_id_idx").on(table.ownerUserId),
    index("nodes_organization_id_idx").on(table.organizationId),
    index("nodes_created_by_user_id_idx").on(table.createdByUserId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sourceType: text("source_type").$type<ProjectSourceType>().notNull(),
    repoProvider: text("repo_provider"),
    repoUrl: text("repo_url"),
    repoKey: text("repo_key"),
    icon: text("icon").notNull().default("folder"),
    color: text("color").notNull().default("#1E66F5"),
    setupScript: text("setup_script").notNull().default(""),
    postScript: text("post_script").notNull().default(""),
    contextEnabled: boolean("context_enabled").notNull().default(true),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("projects_organization_id_idx").on(table.organizationId),
    index("projects_source_type_idx").on(table.sourceType),
    index("projects_created_by_user_id_idx").on(table.createdByUserId),
    uniqueIndex("projects_org_repo_provider_key_uq").on(table.organizationId, table.repoProvider, table.repoKey),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    kind: text("kind").$type<WorkspaceKind>().notNull().default("primary"),
    status: text("status").$type<WorkspaceStatus>().notNull().default("active"),
    branch: text("branch"),
    sourceBranch: text("source_branch"),
    localPath: text("local_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("workspaces_organization_id_idx").on(table.organizationId),
    index("workspaces_project_id_idx").on(table.projectId),
    index("workspaces_user_id_idx").on(table.userId),
    index("workspaces_node_id_idx").on(table.nodeId),
    index("workspaces_kind_idx").on(table.kind),
    index("workspaces_status_idx").on(table.status),
    uniqueIndex("workspaces_project_user_node_kind_branch_uq").on(
      table.projectId,
      table.userId,
      table.nodeId,
      table.kind,
      table.branch,
    ),
  ],
);

export const workspacePullRequests = pgTable(
  "workspace_pull_requests",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    prId: text("pr_id").notNull(),
    title: text("title"),
    url: text("url"),
    branch: text("branch"),
    baseBranch: text("base_branch"),
    state: text("state").$type<WorkspacePullRequestState>().notNull(),
    metadata: jsonb("metadata"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_pull_requests_workspace_id_pr_id_uq").on(table.workspaceId, table.prId),
    index("workspace_pull_requests_workspace_id_idx").on(table.workspaceId),
    index("workspace_pull_requests_organization_id_idx").on(table.organizationId),
    index("workspace_pull_requests_state_idx").on(table.state),
  ],
);

export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    agentKind: text("agent_kind").$type<ScheduledAgentKind>().notNull().default("opencode"),
    prompt: text("prompt").notNull(),
    model: text("model"),
    command: text("command"),
    cronExpression: text("cron_expression").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    status: text("status").$type<ScheduledJobStatus>().notNull().default("active"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastScheduledFor: timestamp("last_scheduled_for", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunStatus: text("last_run_status").$type<"succeeded" | "failed">(),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("scheduled_jobs_organization_id_idx").on(table.organizationId),
    index("scheduled_jobs_project_id_idx").on(table.projectId),
    index("scheduled_jobs_node_id_idx").on(table.nodeId),
    index("scheduled_jobs_status_idx").on(table.status),
    index("scheduled_jobs_next_run_at_idx").on(table.nextRunAt),
    index("scheduled_jobs_created_by_user_id_idx").on(table.createdByUserId),
  ],
);

export const scheduledJobRuns = pgTable(
  "scheduled_job_runs",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => scheduledJobs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").$type<ScheduledJobRunStatus>().notNull().default("pending"),
    responseBody: text("response_body"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("scheduled_job_runs_job_id_scheduled_for_uq").on(table.jobId, table.scheduledFor),
    index("scheduled_job_runs_job_id_idx").on(table.jobId),
    index("scheduled_job_runs_project_id_idx").on(table.projectId),
    index("scheduled_job_runs_node_id_idx").on(table.nodeId),
    index("scheduled_job_runs_status_idx").on(table.status),
    index("scheduled_job_runs_scheduled_for_idx").on(table.scheduledFor),
  ],
);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type OAuthAccount = InferSelectModel<typeof oauthAccounts>;
export type NewOAuthAccount = InferInsertModel<typeof oauthAccounts>;

export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export type RefreshToken = InferSelectModel<typeof refreshTokens>;
export type NewRefreshToken = InferInsertModel<typeof refreshTokens>;

export type Organization = InferSelectModel<typeof organizations>;
export type NewOrganization = InferInsertModel<typeof organizations>;

export type OrganizationMember = InferSelectModel<typeof organizationMembers>;
export type NewOrganizationMember = InferInsertModel<typeof organizationMembers>;

export type Node = InferSelectModel<typeof nodes>;
export type NewNode = InferInsertModel<typeof nodes>;

export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;

export type Workspace = InferSelectModel<typeof workspaces>;
export type NewWorkspace = InferInsertModel<typeof workspaces>;

export type WorkspacePullRequest = InferSelectModel<typeof workspacePullRequests>;
export type NewWorkspacePullRequest = InferInsertModel<typeof workspacePullRequests>;

export type ScheduledJob = InferSelectModel<typeof scheduledJobs>;
export type NewScheduledJob = InferInsertModel<typeof scheduledJobs>;

export type ScheduledJobRun = InferSelectModel<typeof scheduledJobRuns>;
export type NewScheduledJobRun = InferInsertModel<typeof scheduledJobRuns>;

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_invitations_org_id_email_uq").on(table.organizationId, table.email),
    index("organization_invitations_org_id_idx").on(table.organizationId),
    index("organization_invitations_email_idx").on(table.email),
    uniqueIndex("organization_invitations_token_uq").on(table.token),
  ],
);

export type OrganizationInvitation = InferSelectModel<typeof organizationInvitations>;
export type NewOrganizationInvitation = InferInsertModel<typeof organizationInvitations>;
