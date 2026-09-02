/**
 * Project REST/DTO record types (Desktop 11 Phase 47 — moved from the
 * Renderer root `api/types.ts`).
 */

import type { WorkspaceRecord } from "@renderer/domains/workspace";

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
  taskPrefix: string | null;
  organizationId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectWithWorkspacesRecord = ProjectRecord & {
  workspaces: WorkspaceRecord[];
};
