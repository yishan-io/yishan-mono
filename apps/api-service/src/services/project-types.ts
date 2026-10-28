import type { ProjectSourceType, WorkspaceStatus } from "@/db/schema";
import type { WorkspacePullRequestSummary } from "@/services/workspace-service";

/** Project configuration returned by the API. */
export type ProjectView = {
  id: string;
  name: string;
  sourceType: ProjectSourceType;
  repoProvider: string | null;
  repoUrl: string | null;
  repoKey: string | null;
  icon: string;
  color: string;
  setupScript: string;
  postScript: string;
  commands: Array<{ name: string; command: string }>;
  contextEnabled: boolean;
  taskPrefix: string | null;
  organizationId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Project configuration with the actor’s workspaces. */
export type ProjectWithWorkspacesView = ProjectView & {
  workspaces: Array<{
    id: string;
    organizationId: string;
    projectId: string;
    userId: string;
    nodeId: string;
    kind: "primary" | "worktree";
    status: WorkspaceStatus;
    branch: string | null;
    sourceBranch: string | null;
    localPath: string;
    latestPullRequest: WorkspacePullRequestSummary | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

/** Fields accepted when creating a project. */
export type CreateProjectInput = {
  organizationId: string;
  actorUserId: string;
  name: string;
  taskPrefix: string;
  sourceTypeHint?: "unknown" | "git-local" | "git";
  repoUrl?: string;
  nodeId?: string;
  localPath?: string;
  contextEnabled?: boolean;
  icon?: string;
  color?: string;
};

/** Configuration and optional primary path selection for a project update. */
export type UpdateProjectInput = {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  localPath?: string;
  workspaceId?: string;
  nodeId?: string;
  name?: string;
  icon?: string;
  color?: string;
  setupScript?: string;
  postScript?: string;
  commands?: Array<{ name: string; command: string }>;
  contextEnabled?: boolean;
};
