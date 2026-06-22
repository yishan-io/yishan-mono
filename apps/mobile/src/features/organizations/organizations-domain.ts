import type { Organization, OrganizationRecord } from "./organizations.types";

export function normalizeOrganization(record: OrganizationRecord): Organization {
  return {
    createdAt: record.createdAt,
    id: record.id,
    memberCount: record.members.length,
    name: record.name,
    updatedAt: record.updatedAt,
  };
}
