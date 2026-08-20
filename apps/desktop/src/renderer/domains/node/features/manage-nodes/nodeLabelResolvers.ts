import type { OrganizationMemberRecord } from "@renderer/domains/organization";
import type { NodeRecord } from "../../api/types";

/** Resolves the display name of a node's owner member. */
export function resolveOwnerLabel(
  node: NodeRecord,
  members: OrganizationMemberRecord[],
  fallbackLabel: string,
): string {
  const member = members.find((entry) => entry.userId === node.ownerUserId);
  return member?.name ?? fallbackLabel;
}

/** Resolves the node version metadata, falling back to a label. */
export function resolveNodeVersion(node: NodeRecord, fallbackLabel: string): string {
  const version = node.metadata?.version;
  return typeof version === "string" ? version : fallbackLabel;
}

/** Resolves the node scope label (private/shared). */
export function resolveNodeTypeLabel(node: NodeRecord, privateLabel: string, sharedLabel: string): string {
  return node.scope === "private" ? privateLabel : sharedLabel;
}

/** Resolves the node kind label (managed/external). */
export function resolveNodeKindLabel(node: NodeRecord, managedLabel: string, externalLabel: string): string {
  return node.kind === "managed" ? managedLabel : externalLabel;
}
