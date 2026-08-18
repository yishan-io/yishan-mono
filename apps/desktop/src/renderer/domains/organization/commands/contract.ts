import type * as orgCommands from "./orgCommands";

/**
 * OrganizationCommands — the public command surface for the Organization
 * feature (Phase 12, desktop5.md). Declared by the owning module;
 * `contracts/conformance.ts` enforces the contract at typecheck time.
 */
export type OrganizationCommands = {
  switchOrganization: typeof orgCommands.switchOrganization;
  addOrgMember: typeof orgCommands.addOrgMember;
  cancelOrgInvite: typeof orgCommands.cancelOrgInvite;
  removeOrgMember: typeof orgCommands.removeOrgMember;
  leaveOrg: typeof orgCommands.leaveOrg;
  createOrganization: typeof orgCommands.createOrganization;
  listOrganizations: typeof orgCommands.listOrganizations;
  listOrganizationMembers: typeof orgCommands.listOrganizationMembers;
  listPendingInvites: typeof orgCommands.listPendingInvites;
};
