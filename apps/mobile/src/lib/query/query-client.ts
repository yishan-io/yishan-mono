import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/errors";

/** Owns the single app-wide react-query client and default retry policy. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (isApiError(error)) {
          if (error.status >= 400 && error.status < 500) {
            return false;
          }

          return failureCount < 1;
        }

        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
