import type { Workspace } from "@/features/workspaces/workspaces.types";

export type Project = {
  id: string;
  name: string;
  sourceType: string;
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

export type ProjectWithWorkspaces = Project & {
  workspaces: Workspace[];
};

export type CreateProjectInput = {
  name: string;
  repoUrl?: string;
};

export type UpdateProjectInput = {
  name?: string;
  icon?: string;
  color?: string;
  contextEnabled?: boolean;
};
