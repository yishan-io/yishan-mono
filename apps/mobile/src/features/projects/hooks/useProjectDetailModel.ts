import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useProjectQuery } from "@/features/projects/queries/useProjectQuery";
import { goBackOrReplace } from "@/lib/navigation/go-back-or-replace";
import { readRouteParam } from "@/lib/navigation/read-route-param";
import { buildProjectDetailRows, buildProjectDetailSummary } from "../project-detail-domain";

type ProjectDetailParams = {
  orgId?: string | string[];
  projectId?: string | string[];
};

export function useProjectDetailModel() {
  const { t } = useAppLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<ProjectDetailParams>();
  const organizationId = readRouteParam(params.orgId);
  const projectId = readRouteParam(params.projectId);
  const projectQuery = useProjectQuery(organizationId, projectId);
  const project = projectQuery.data ?? null;

  const onBack = useCallback(() => {
    goBackOrReplace(router, "/(app)/shell");
  }, [router]);

  const rows = useMemo(() => buildProjectDetailRows(project, t), [project, t]);
  const summary = useMemo(() => buildProjectDetailSummary(project, t), [project, t]);

  return {
    onBack,
    organizationId,
    project,
    projectId,
    projectQuery,
    rows,
    summary,
    t,
  };
}
