import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { getMe } from "@/features/me/me.api";
import { queryKeys } from "@/lib/query/query-keys";

// Owns the single authenticated current-user query consumed by shell, profile, settings, and notifications.
export function useMeQuery() {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;

  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }

      return getMe(accessToken);
    },
    enabled: status === "authenticated" && !!accessToken,
  });
}
