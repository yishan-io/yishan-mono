/**
 * Git REST/DTO record types (Desktop 11 Phase 47 — moved from the Renderer
 * root `api/types.ts`).
 */

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
