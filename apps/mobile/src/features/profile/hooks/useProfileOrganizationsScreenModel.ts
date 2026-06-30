import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useOrganizationsQuery } from "@/features/organizations";
import { goBackOrReplace } from "@/lib/navigation/go-back-or-replace";
import { readRouteParam } from "@/lib/navigation/read-route-param";

type ProfileOrganizationsParams = {
  orgId?: string | string[];
  orgName?: string | string[];
};

export function useProfileOrganizationsScreenModel() {
  const { t } = useAppLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<ProfileOrganizationsParams>();
  const currentOrganizationId = readRouteParam(params.orgId);
  const currentOrganizationName = readRouteParam(params.orgName);
  const organizationsQuery = useOrganizationsQuery();
  const organizations = organizationsQuery.data ?? [];

  const onBack = useCallback(() => {
    goBackOrReplace(router, {
      pathname: "/(app)/profile",
      params: {
        ...(currentOrganizationId ? { orgId: currentOrganizationId } : {}),
        ...(currentOrganizationName ? { orgName: currentOrganizationName } : {}),
      },
    });
  }, [currentOrganizationId, currentOrganizationName, router]);

  const onOpenOrganizationDetails = useCallback(
    (organizationId: string, organizationName?: string | null) => {
      router.push({
        pathname: "/(app)/organizations/[orgId]",
        params: {
          orgId: organizationId,
          ...(organizationName ? { orgName: organizationName } : {}),
        },
      });
    },
    [router],
  );

  return {
    onBack,
    onOpenOrganizationDetails,
    organizations,
    organizationsQuery,
    t,
  };
}
