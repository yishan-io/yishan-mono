export type NodeScope = "private" | "shared";
export type NodeKind = "managed" | "external";

export type Node = {
  id: string;
  name: string;
  kind: NodeKind;
  scope: NodeScope;
  endpoint: string | null;
  metadata: Record<string, unknown> | null;
  ownerUserId: string | null;
  organizationId: string | null;
  canUse: boolean;
  isOnline: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
