/**
 * Project feature vocabulary (Phase 3 split of features/workbench/types.ts).
 */
export type WorkspaceProjectCommand = {
  name: string;
  command: string;
};

export type WorkspaceProjectRecord = {
  id: string;
  organizationId?: string;
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
  contextEnabled?: boolean;
  taskPrefix?: string | null;
  defaultBranch?: string | null;
  icon?: string | null;
  color?: string | null;
  setupScript?: string | null;
  postScript?: string | null;
  commands?: WorkspaceProjectCommand[];
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
};

import type { ExternalAppId } from "../../../shared/contracts/externalApps";

/**
 * Synthetic project id used for local (non-git) folder workspaces. Folder
 * workspaces are daemon-owned rows (kind="folder") mapped into the workspace
 * list but have no real backend project, so they share this sentinel value.
 */
export type WorkspaceStoreOrganizationPreference = {
  displayProjectIds?: string[];
  knownProjectIds?: string[];
  lastUsedExternalAppId?: ExternalAppId;
};
