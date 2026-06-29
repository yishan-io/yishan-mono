export type OrganizationRecord = {
  id: string;
  name: string;
  plan?: "free" | "pro" | "premium";
  members?: OrganizationMemberRecord[];
  voiceUsage?: VoiceTranscriptionUsageRecord;
};

export type VoiceTranscriptionUsageRecord = {
  quotaMinutes: number;
  usedSeconds: number;
  remainingSeconds: number;
};

export type VoiceTranscriptionResponse = {
  transcript: string;
  optimizedText: string;
};

export type OrganizationMemberRecord = {
  userId: string;
  role: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type OrganizationInviteRecord = {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
};

export type AddOrganizationMemberResponse =
  | { invited: false; member: OrganizationMemberRecord }
  | { invited: true; invite: OrganizationInviteRecord };

export type ProjectCommandRecord = {
  name: string;
  command: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  sourceType: "git" | "git-local" | "unknown";
  repoProvider: string | null;
  repoUrl: string | null;
  repoKey: string | null;
  icon: string;
  color: string;
  setupScript: string;
  postScript: string;
  commands?: ProjectCommandRecord[];
  contextEnabled: boolean;
  organizationId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspacePullRequestSummary = {
  id: string;
  prId: string;
  title: string | null;
  url: string | null;
  branch: string | null;
  baseBranch: string | null;
  state: "open" | "closed" | "merged";
  metadata: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
};

export type WorkspaceRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  nodeId: string;
  kind: "primary" | "worktree";
  status: "active" | "closed" | "provisioning";
  branch: string | null;
  sourceBranch: string | null;
  localPath: string;
  latestPullRequest: WorkspacePullRequestSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspacePullRequestRecord = {
  id: string;
  workspaceId: string;
  organizationId: string;
  prId: string;
  title: string | null;
  url: string | null;
  branch: string | null;
  baseBranch: string | null;
  state: "open" | "closed" | "merged";
  metadata: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectWithWorkspacesRecord = ProjectRecord & {
  workspaces: WorkspaceRecord[];
};

export type NodeRecord = {
  id: string;
  name: string;
  kind: "managed" | "external";
  scope: "private" | "shared";
  endpoint: string | null;
  metadata: Record<string, unknown> | null;
  ownerUserId: string | null;
  organizationId: string | null;
  canUse: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  isOnline: boolean;
};
