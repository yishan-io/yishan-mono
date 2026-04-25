import { requestJson } from "./restClient";
import type { OrganizationRecord } from "./types";

/** Lists organizations visible to the signed-in user. */
export async function listOrganizations(): Promise<OrganizationRecord[]> {
  const response = await requestJson<{ organizations: OrganizationRecord[] }>("/orgs");
  return response.organizations;
}

/** Creates one organization. */
export async function createOrganization(name: string): Promise<OrganizationRecord> {
  const response = await requestJson<{ organization: OrganizationRecord }>("/orgs", {
    method: "POST",
    body: { name },
  });

  return response.organization;
}
