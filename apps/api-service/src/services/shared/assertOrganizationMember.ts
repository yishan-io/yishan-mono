import { OrganizationMembershipRequiredError } from "@/errors";
import type { OrganizationService } from "@/services/organization-service";

/**
 * Throws `OrganizationMembershipRequiredError` if `userId` is not a member
 * of `organizationId`. Call this at the top of any service method that
 * requires authenticated org access.
 */
export async function assertOrganizationMember(
  organizationService: OrganizationService,
  organizationId: string,
  userId: string,
): Promise<void> {
  const role = await organizationService.getMembershipRole({ organizationId, userId });
  if (!role) {
    throw new OrganizationMembershipRequiredError();
  }
}
