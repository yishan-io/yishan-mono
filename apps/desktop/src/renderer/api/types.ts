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
  icon: string;
  color: string;
  setupScript: string;
  postScript: string;
  contextEnabled: boolean;
  organizationId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  nodeId: string;
  kind: "primary" | "worktree";
  status: "active" | "closed";
  branch: string | null;
  sourceBranch: string | null;
  localPath: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectWithWorkspacesRecord = ProjectRecord & {
  workspaces: WorkspaceRecord[];
};

export type NodeRecord = {
  id: string;
  name: string;
  scope: "private" | "shared";
  endpoint: string | null;
  metadata: Record<string, unknown> | null;
  ownerUserId: string | null;
  organizationId: string | null;
  canUse: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
