export type OrganizationRecord = {
  id: string;
  name: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  sourceType: "git" | "git-local" | "unknown";
  repoProvider: string | null;
  repoUrl: string | null;
  repoKey: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

export type ProjectWorkspaceRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  nodeId: string;
  kind: "primary" | "worktree";
  branch: string | null;
  localPath: string;
  createdAt: string;
  updatedAt: string;
};

export type NodeRecord = {
  id: string;
  name: string;
  scope: "local" | "remote";
  endpoint: string | null;
  metadata: Record<string, unknown> | null;
  ownerUserId: string | null;
  organizationId: string | null;
  canUse: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
