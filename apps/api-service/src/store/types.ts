export type OrganizationMemberRole = "owner" | "admin" | "member";
export type OrganizationPlan = "free" | "pro" | "premium";
export type TokenUsageCostSource = "unknown" | "estimated" | "direct";
export type TokenUsageAttributionConfidence = "exact" | "prefix_match" | "fallback_unknown";

/** All timestamps are ISO-8601 strings. */
export type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  defaultOrganizationId?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMemberRecord = {
  userId: string;
  role: OrganizationMemberRole;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  joinedAt: string;
};

export type OrganizationInviteRecord = {
  id: string;
  email: string;
  role: OrganizationMemberRole;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  plan: OrganizationPlan;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  members: OrganizationMemberRecord[];
  invites: OrganizationInviteRecord[];
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
};

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  replacedByTokenId: string | null;
  createdAt: string;
};

export type VoiceUsageRecord = { seconds: number; requests: number };

/** `{ orgId }` for premium (per org); `{ orgId, userId }` for pro (per org + user). */
export type VoiceScope = { orgId: string; userId?: string };

export type TokenUsageHourlyRow = {
  projectId: string;
  workspaceId: string;
  workspacePath: string;
  agentKind: string;
  model: string;
  modelNormalized: string;
  bucketStartHourUtc: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cachedWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  totalCostMicrosUsd: number;
  costSource: TokenUsageCostSource;
  eventCount: number;
  sessionCount: number;
  turnCount: number;
  toolCallCount: number;
  attributionConfidence: TokenUsageAttributionConfidence;
  ingestedAt: string;
  runId: string;
};

export type TokenUsageDayRecord = { rows: TokenUsageHourlyRow[] };
