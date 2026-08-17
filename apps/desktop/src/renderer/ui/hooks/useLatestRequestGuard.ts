import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Tracks the latest async request id and mounted status to prevent stale state updates.
 */
export function useLatestRequestGuard() {
  const latestRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const beginRequest = useCallback(() => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    return requestId;
  }, []);

  const isCurrentRequest = useCallback((requestId: number) => {
    return isMountedRef.current && latestRequestIdRef.current === requestId;
  }, []);

  const isMounted = useCallback(() => isMountedRef.current, []);

  return useMemo(
    () => ({
      beginRequest,
      isCurrentRequest,
      isMounted,
    }),
    [beginRequest, isCurrentRequest, isMounted],
  );
}
