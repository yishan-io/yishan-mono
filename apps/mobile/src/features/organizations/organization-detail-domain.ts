import type { Organization } from "./organizations.types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function findOrganizationById(organizations: Organization[], organizationId: string) {
  return organizations.find((item) => item.id === organizationId) ?? null;
}

export function buildOrganizationMetrics({
  nodesCount,
  organization,
  projectsCount,
  t,
}: {
  nodesCount: number;
  organization: Organization | null;
  projectsCount: number;
  t: Translate;
}) {
  if (!organization) {
    return [];
  }

  return [
    { label: t("settings.nodesTitle"), value: String(nodesCount) },
    { label: t("settings.projectsTitle"), value: String(projectsCount) },
    { label: t("settings.membersTitle"), value: String(organization.memberCount) },
  ];
}
