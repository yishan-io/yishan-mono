/**
 * Node REST/DTO record types (Desktop 11 Phase 47 — moved from the Renderer
 * root `api/types.ts`).
 */

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
