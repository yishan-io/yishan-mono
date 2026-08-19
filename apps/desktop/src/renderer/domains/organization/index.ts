/**
 * Organization Domain public API (Domains plan D4).
 *
 * Exports the stable command surface for organization administration.
 * Cross-Domain code imports organization through this file only.
 */
export {
  createOrganization,
  listOrganizationMembers,
  listOrganizations,
  switchOrganization,
} from "./commands/orgCommands";

export type {
  AddOrganizationMemberResponse,
  OrganizationInviteRecord,
  OrganizationMemberRecord,
  OrganizationRecord,
} from "@renderer/api/types";
export { CreateOrganizationDialogView } from "./features/create-organization/CreateOrganizationDialogView";
export { MemberSettingsView } from "./features/manage-members/MemberSettingsView";
