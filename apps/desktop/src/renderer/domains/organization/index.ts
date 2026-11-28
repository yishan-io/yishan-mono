/**
 * Organization Domain public API (Domains plan D4).
 *
 * Exports the stable command surface for organization administration.
 * Cross-Domain code imports organization through this file only.
 */
export {
  createOrganization,
  listOrganizations,
  switchOrganization,
} from "./commands/orgCommands";

export type { OrganizationMemberRecord, OrganizationRecord } from "./api/types";
