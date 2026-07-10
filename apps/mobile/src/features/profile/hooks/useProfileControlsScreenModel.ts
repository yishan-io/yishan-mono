import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useMeQuery } from "@/features/me/queries/useMeQuery";
import { goBackOrReplace } from "@/lib/navigation/go-back-or-replace";
import { readRouteParam } from "@/lib/navigation/read-route-param";

type ProfileControlsParams = {
  orgId?: string | string[];
  orgName?: string | string[];
};

export function useProfileControlsScreenModel() {
  const { t } = useAppLanguage();
  const router = useRouter();
  const { signOut } = useAuth();
  const params = useLocalSearchParams<ProfileControlsParams>();
  const currentOrganizationId = readRouteParam(params.orgId);
  const currentOrganizationName = readRouteParam(params.orgName);

  const meQuery = useMeQuery();

  const onBack = useCallback(() => {
    goBackOrReplace(router, "/(app)/shell");
  }, [router]);

  const onOpenSettings = useCallback(() => {
    router.push({
      pathname: "/(app)/settings",
      params: {
        ...(currentOrganizationId ? { orgId: currentOrganizationId } : {}),
        ...(currentOrganizationName ? { orgName: currentOrganizationName } : {}),
      },
    });
  }, [currentOrganizationId, currentOrganizationName, router]);

  const onOpenOrganizations = useCallback(() => {
    router.push({
      pathname: "/(app)/profile/organizations",
      params: {
        ...(currentOrganizationId ? { orgId: currentOrganizationId } : {}),
        ...(currentOrganizationName ? { orgName: currentOrganizationName } : {}),
      },
    });
  }, [currentOrganizationId, currentOrganizationName, router]);

  const onRequestSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);

  return {
    currentOrganizationId,
    meQuery,
    onBack,
    onOpenOrganizations,
    onOpenSettings,
    onRequestSignOut,
    t,
  };
}
