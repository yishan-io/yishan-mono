import { useEffect, useRef, useState } from "react";

const DEFAULT_NOTICE_TIMEOUT_MS = 1800;

type UseActionCompletionNoticeInput = {
  hasError: boolean;
  isRefreshing: boolean;
  noticeTimeoutMs?: number;
  onAction?: (() => void) | null;
};

/** Tracks a manual action so we can show a transient success notice after it finishes cleanly. */
export function useActionCompletionNotice({
  hasError,
  isRefreshing,
  noticeTimeoutMs = DEFAULT_NOTICE_TIMEOUT_MS,
  onAction,
}: UseActionCompletionNoticeInput) {
  const [showNotice, setShowNotice] = useState(false);
  const actionRequestedRef = useRef(false);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAction = () => {
    if (!onAction) {
      return;
    }

    actionRequestedRef.current = true;
    onAction();
  };

  useEffect(() => {
    if (!actionRequestedRef.current || isRefreshing || hasError) {
      return;
    }

    actionRequestedRef.current = false;
    setShowNotice(true);
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = setTimeout(() => {
      noticeTimeoutRef.current = null;
      setShowNotice(false);
    }, noticeTimeoutMs);
  }, [hasError, isRefreshing, noticeTimeoutMs]);

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
        noticeTimeoutRef.current = null;
      }
    },
    [],
  );

  return {
    handleAction,
    showNotice,
  };
}
