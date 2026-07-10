import { useLocalSearchParams, useRouter } from "expo-router";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useNodesQuery } from "@/features/nodes/queries/useNodesQuery";
import { useProjectsQuery } from "@/features/projects/queries/useProjectsQuery";
import { goBackOrReplace } from "@/lib/navigation/go-back-or-replace";
import { readRouteParam } from "@/lib/navigation/read-route-param";
import { buildOrganizationMetrics, findOrganizationById } from "../organization-detail-domain";
import { useOrganizationsQuery } from "../queries/useOrganizationsQuery";

type OrganizationDetailParams = {
  orgId?: string | string[];
  orgName?: string | string[];
};

export function useOrganizationDetailModel() {
  const router = useRouter();
  const params = useLocalSearchParams<OrganizationDetailParams>();
  const { t } = useAppLanguage();
  const organizationId = readRouteParam(params.orgId);

  const organizationsQuery = useOrganizationsQuery({ enabled: organizationId.length > 0 });
  const projectsQuery = useProjectsQuery(organizationId, { enabled: organizationId.length > 0 });
  const nodesQuery = useNodesQuery(organizationId, { enabled: organizationId.length > 0 });

  const organization = findOrganizationById(organizationsQuery.data ?? [], organizationId);
  const projects = projectsQuery.data ?? [];
  const nodes = nodesQuery.data ?? [];

  return {
    metrics: buildOrganizationMetrics({
      nodesCount: nodes.length,
      organization,
      projectsCount: projects.length,
      t,
    }),
    nodes,
    onBack: () => goBackOrReplace(router, "/(app)/profile/organizations"),
    onRetry: () => {
      void organizationsQuery.refetch();
      void projectsQuery.refetch();
      void nodesQuery.refetch();
    },
    organization,
    organizationId,
    projects,
    queries: {
      nodesQuery,
      organizationsQuery,
      projectsQuery,
    },
    t,
  };
}
