import { useLocalSearchParams, useRouter } from "expo-router";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useNodesQuery } from "@/features/nodes/queries/useNodesQuery";
import { goBackOrReplace } from "@/lib/navigation/go-back-or-replace";
import { readRouteParam } from "@/lib/navigation/read-route-param";

type SettingsNodesParams = {
  orgId?: string | string[];
  orgName?: string | string[];
};

export function useSettingsNodesScreenModel() {
  const router = useRouter();
  const params = useLocalSearchParams<SettingsNodesParams>();
  const { t } = useAppLanguage();
  const organizationId = readRouteParam(params.orgId);
  const organizationName = readRouteParam(params.orgName);
  const nodesQuery = useNodesQuery(organizationId, { enabled: organizationId.length > 0 });

  return {
    nodesQuery,
    onBack: () => goBackOrReplace(router, "/(app)/settings"),
    organizationId,
    organizationName,
    t,
  };
}
