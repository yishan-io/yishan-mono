import { apiRequest } from "@/lib/api/client";
import { normalizeOrganization } from "./organizations-domain";
import type { Organization, OrganizationRecord } from "./organizations.types";

export async function listOrganizations(accessToken: string): Promise<Organization[]> {
  const response = await apiRequest<{ organizations: OrganizationRecord[] }>("/orgs", {
    accessToken,
  });

  return response.organizations.map(normalizeOrganization);
}

export async function createOrganization(accessToken: string, input: { name: string }): Promise<Organization> {
  const response = await apiRequest<{ organization: OrganizationRecord }>("/orgs", {
    method: "POST",
    accessToken,
    body: { name: input.name },
  });

  return normalizeOrganization(response.organization);
}
