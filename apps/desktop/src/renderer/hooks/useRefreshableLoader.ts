import { useCallback, useEffect, useState } from "react";
import { withTimeout } from "../helpers/withTimeout";
import { useLatestRequestGuard } from "./useLatestRequestGuard";

type UseRefreshableLoaderOptions<T> = {
  /** Async function that fetches fresh data. Receives `isManualRefresh`. */
  fetch: (isManualRefresh: boolean) => Promise<T>;
  /** Timeout in milliseconds applied to each fetch call. */
  timeoutMs: number;
  /** Minimum wall-clock duration (ms) a manual refresh must appear to run. */
  minRefreshMs?: number;
};

type UseRefreshableLoaderResult<T> = {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  hasLoadError: boolean;
  /** Trigger a manual refresh. */
  refresh: () => void;
};

/**
 * Encapsulates the standard async-loading pattern used across settings views:
 * request-guard, optional min-duration refresh padding, and `isLoading /
 * isRefreshing / hasLoadError` state.
 */
export function useRefreshableLoader<T>({
  fetch,
  timeoutMs,
  minRefreshMs = 0,
}: UseRefreshableLoaderOptions<T>): UseRefreshableLoaderResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const requestGuard = useLatestRequestGuard();

  const load = useCallback(
    async (isManualRefresh: boolean) => {
      const loadId = requestGuard.beginRequest();
      const isCurrentLoad = () => requestGuard.isCurrentRequest(loadId);
      const refreshStartedAt = isManualRefresh ? Date.now() : null;

      if (isManualRefresh) {
        setIsRefreshing(true);
      }
      setHasLoadError(false);

      try {
        const result = await withTimeout(fetch(isManualRefresh), timeoutMs, `Load timed out after ${timeoutMs}ms`);
        if (!isCurrentLoad()) return;
        setData(result);
      } catch (error) {
        if (!isCurrentLoad()) return;
        console.error("[useRefreshableLoader] Load failed", error);
        setHasLoadError(true);
      } finally {
        if (refreshStartedAt !== null && minRefreshMs > 0) {
          const elapsed = Date.now() - refreshStartedAt;
          const remaining = minRefreshMs - elapsed;
          if (remaining > 0) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, remaining);
            });
          }
        }
        if (isCurrentLoad()) {
          if (isManualRefresh) setIsRefreshing(false);
          setIsLoading(false);
        }
      }
    },
    [fetch, timeoutMs, minRefreshMs, requestGuard],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { data, isLoading, isRefreshing, hasLoadError, refresh };
}
