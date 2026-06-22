import { useEffect, useRef, useState } from "react";

const REFRESH_NOTICE_TIMEOUT_MS = 1800;

// Owns only the transient "refresh finished" notice timing for the workspace tree.
export function useRepositoriesRefreshNotice({
  hasError,
  isRefreshing,
  onRefresh,
}: {
  hasError: boolean;
  isRefreshing: boolean;
  onRefresh?: (() => void) | null;
}) {
  const [showRefreshNotice, setShowRefreshNotice] = useState(false);
  const refreshRequestedRef = useRef(false);
  const refreshNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = () => {
    if (!onRefresh) {
      return;
    }

    refreshRequestedRef.current = true;
    onRefresh();
  };

  useEffect(() => {
    if (!refreshRequestedRef.current || isRefreshing || hasError) {
      return;
    }

    refreshRequestedRef.current = false;
    setShowRefreshNotice(true);
    if (refreshNoticeTimeoutRef.current) {
      clearTimeout(refreshNoticeTimeoutRef.current);
    }
    refreshNoticeTimeoutRef.current = setTimeout(() => {
      refreshNoticeTimeoutRef.current = null;
      setShowRefreshNotice(false);
    }, REFRESH_NOTICE_TIMEOUT_MS);
  }, [hasError, isRefreshing]);

  useEffect(
    () => () => {
      if (refreshNoticeTimeoutRef.current) {
        clearTimeout(refreshNoticeTimeoutRef.current);
        refreshNoticeTimeoutRef.current = null;
      }
    },
    [],
  );

  return {
    handleRefresh,
    showRefreshNotice,
  };
}
