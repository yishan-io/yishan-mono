import type { OrganizationMemberRole } from "@/db/schema";
import { OrganizationMembershipRequiredError } from "@/errors";
import type { OrganizationService } from "@/services/organization-service";

/**
 * Throws `OrganizationMembershipRequiredError` if `userId` is not a member
 * of `organizationId`. Call this at the top of any service method that
 * requires authenticated org access.
 *
 * Pass `preResolvedRole` when the middleware has already verified membership
 * (e.g. `c.get("organizationRole")`), which avoids a redundant DB round-trip.
 */
export async function assertOrganizationMember(
  organizationService: OrganizationService,
  organizationId: string,
  userId: string,
  preResolvedRole?: OrganizationMemberRole,
): Promise<OrganizationMemberRole> {
  if (preResolvedRole) {
    return preResolvedRole;
  }
  const role = await organizationService.getMembershipRole({ organizationId, userId });
  if (!role) {
    throw new OrganizationMembershipRequiredError();
  }
  return role;
}
