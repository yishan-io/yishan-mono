export type OrganizationRecord = {
  id: string;
  name: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  key?: string;
  path?: string;
  missing?: boolean;
  gitUrl?: string;
  sourceType?: "git" | "git-local" | "unknown";
  repoProvider?: string | null;
  repoUrl?: string | null;
  repoKey?: string | null;
  localPath?: string | null;
  worktreePath?: string | null;
  privateContextEnabled?: boolean;
  defaultBranch?: string | null;
  icon?: string | null;
  iconBgColor?: string | null;
  setupScript?: string | null;
  postScript?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
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

export type ProjectWithWorkspacesRecord = ProjectRecord & {
  workspaces: ProjectWorkspaceRecord[];
};

export type CreateRepoResult = {
  id: string;
  key?: string | null;
  localPath?: string | null;
  worktreePath?: string | null;
  gitUrl?: string | null;
  privateContextEnabled?: boolean;
  contextEnabled?: boolean;
  icon?: string | null;
  color?: string | null;
  setupScript?: string | null;
  postScript?: string | null;
  defaultBranch?: string | null;
};

export type NodeRecord = {
  id: string;
  name: string;
  scope: "private" | "shared" | "local" | "remote";
  endpoint: string | null;
  metadata: Record<string, unknown> | null;
  ownerUserId: string | null;
  organizationId: string | null;
  canUse: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
