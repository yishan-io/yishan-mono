import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { listOrganizations } from "@/features/organizations/organizations.api";
import { queryKeys } from "@/lib/query/query-keys";

export function useOrganizationsQuery(options?: { enabled?: boolean }) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: async () => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }

      return listOrganizations(accessToken);
    },
    enabled: enabled && status === "authenticated" && !!accessToken,
  });
}
