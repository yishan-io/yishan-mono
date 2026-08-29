import { getDaemonLog } from "@renderer/domains/settings/commands/settingsCommands";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DaemonLogSource } from "../../../host/daemonHost";

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

/** Manages daemon log dialog loading state, parsing, and prepend-on-scroll behavior. */
export function useDaemonLogDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<DaemonLogSource>("system");
  const [isLoading, setIsLoading] = useState(false);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleEntryCount, setVisibleEntryCount] = useState(INITIAL_VISIBLE_ENTRY_COUNT);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const prevScrollHeightRef = useRef(0);
  const loadRequestIdRef = useRef(0);

  const allEntries = useMemo(() => parseLogEntries(logContent), [logContent]);
  const entries = useMemo(() => allEntries.slice(-visibleEntryCount), [allEntries, visibleEntryCount]);

  const loadLog = useCallback(async (logSource: DaemonLogSource) => {
    const requestId = ++loadRequestIdRef.current;
    setIsOpen(true);
    setIsLoading(true);
    setLogContent(null);
    setError(null);
    setVisibleEntryCount(INITIAL_VISIBLE_ENTRY_COUNT);
    prevScrollHeightRef.current = 0;

    try {
      const result = await getDaemonLog(logSource);
      if (requestId !== loadRequestIdRef.current) return;
      if (result.ok) {
        setLogContent(result.content);
        return;
      }
      setError(result.error);
    } catch (error) {
      if (requestId === loadRequestIdRef.current) {
        setError(getErrorMessage(error) || "Failed to read daemon log");
      }
    } finally {
      if (requestId === loadRequestIdRef.current) setIsLoading(false);
    }
  }, []);

  const open = useCallback(async () => {
    setSource("system");
    await loadLog("system");
  }, [loadLog]);

  const selectSource = useCallback(
    async (nextSource: DaemonLogSource) => {
      setSource(nextSource);
      await loadLog(nextSource);
    },
    [loadLog],
  );

  const close = useCallback(() => {
    loadRequestIdRef.current += 1;
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
    selectSource,
    source,
  };
}
