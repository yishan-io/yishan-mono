import type { DaemonLogResult } from "@main/ipc";
import { getErrorMessage } from "@renderer/helpers/errorHelpers";
import { getDesktopHostBridge } from "@renderer/rpc/rpcTransport";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

const INITIAL_VISIBLE_ENTRY_COUNT = 100;
const ENTRY_COUNT_INCREMENT = 100;
const LOAD_MORE_SCROLL_THRESHOLD = 30;

type LogEntry = Record<string, unknown> & {
  _raw?: string;
};

function parseLogEntries(logContent: string | null): LogEntry[] {
  if (!logContent) {
    return [];
  }

  return logContent
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return { _raw: line };
      }
    });
}

async function readDaemonLog(): Promise<DaemonLogResult> {
  return getDesktopHostBridge().readDaemonLog();
}

/** Manages daemon log dialog loading state, parsing, and prepend-on-scroll behavior. */
export function useDaemonLogDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleEntryCount, setVisibleEntryCount] = useState(INITIAL_VISIBLE_ENTRY_COUNT);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const prevScrollHeightRef = useRef(0);

  const allEntries = useMemo(() => parseLogEntries(logContent), [logContent]);
  const entries = useMemo(() => allEntries.slice(-visibleEntryCount), [allEntries, visibleEntryCount]);

  const open = useCallback(async () => {
    setIsOpen(true);
    setIsLoading(true);
    setLogContent(null);
    setError(null);
    setVisibleEntryCount(INITIAL_VISIBLE_ENTRY_COUNT);
    prevScrollHeightRef.current = 0;

    try {
      const result = await readDaemonLog();
      if (result.ok) {
        setLogContent(result.content);
        return;
      }
      setError(result.error);
    } catch (error) {
      setError(getErrorMessage(error) || "Failed to read daemon log");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setLogContent(null);
    setError(null);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleEntryCount drives the expansion
  useLayoutEffect(() => {
    const container = logContainerRef.current;
    if (!container) {
      return;
    }
    if (prevScrollHeightRef.current === 0) {
      container.scrollTop = container.scrollHeight;
      prevScrollHeightRef.current = container.scrollHeight;
      return;
    }

    const newScrollHeight = container.scrollHeight;
    if (newScrollHeight > prevScrollHeightRef.current) {
      container.scrollTop = newScrollHeight - prevScrollHeightRef.current;
    }
    prevScrollHeightRef.current = newScrollHeight;
  }, [entries.length, visibleEntryCount]);

  const handleScroll = useCallback(() => {
    const container = logContainerRef.current;
    if (!container || container.scrollTop > LOAD_MORE_SCROLL_THRESHOLD || allEntries.length <= visibleEntryCount) {
      return;
    }

    prevScrollHeightRef.current = container.scrollHeight;
    setVisibleEntryCount((prev) => Math.min(prev + ENTRY_COUNT_INCREMENT, allEntries.length));
  }, [allEntries.length, visibleEntryCount]);

  return {
    close,
    entries,
    error,
    handleScroll,
    isLoading,
    isOpen,
    logContainerRef,
    open,
  };
}
