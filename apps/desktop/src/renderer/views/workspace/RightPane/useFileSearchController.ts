import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { searchFiles } from "../../../commands/fileCommands";
import type { FileSearchResult } from "../../../rpc/daemonTypes";

const MAX_FILE_SEARCH_RESULTS = 100;

type UseFileSearchControllerInput = {
  workspaceId?: string;
  openFileSearchRequestKey: number;
  lastHandledFileSearchRequestKey: number;
  onFileSearchRequestHandled?: (requestKey: number) => void;
  openSearchResult: (path: string) => Promise<void>;
};

/** Manages quick-open file search state, filtering, keyboard navigation, and open actions. */
export function useFileSearchController({
  workspaceId,
  openFileSearchRequestKey,
  lastHandledFileSearchRequestKey,
  onFileSearchRequestHandled,
  openSearchResult,
}: UseFileSearchControllerInput) {
  const [isFileSearchOpen, setIsFileSearchOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [selectedSearchResultIndex, setSelectedSearchResultIndex] = useState(0);
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchResult[]>([]);
  const searchRequestIdRef = useRef(0);

  const trimmedFileSearchQuery = fileSearchQuery.trim();
  const deferredFileSearchQuery = useDeferredValue(trimmedFileSearchQuery);

  useEffect(() => {
    if (openFileSearchRequestKey <= lastHandledFileSearchRequestKey) {
      return;
    }

    setFileSearchQuery("");
    setSelectedSearchResultIndex(0);
    setFileSearchResults([]);
    setIsFileSearchOpen(true);
    onFileSearchRequestHandled?.(openFileSearchRequestKey);
  }, [lastHandledFileSearchRequestKey, onFileSearchRequestHandled, openFileSearchRequestKey]);

  useEffect(() => {
    if (!isFileSearchOpen) {
      return;
    }

    if (!deferredFileSearchQuery || !workspaceId) {
      setFileSearchResults([]);
      return;
    }

    searchRequestIdRef.current += 1;
    const requestId = searchRequestIdRef.current;
    void searchFiles({
      workspaceId,
      query: deferredFileSearchQuery,
      limit: MAX_FILE_SEARCH_RESULTS,
    })
      .then((results) => {
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        setFileSearchResults(results);
      })
      .catch(() => {
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        setFileSearchResults([]);
      });
  }, [deferredFileSearchQuery, isFileSearchOpen, workspaceId]);

  useEffect(() => {
    if (selectedSearchResultIndex < fileSearchResults.length) {
      return;
    }

    setSelectedSearchResultIndex(Math.max(0, fileSearchResults.length - 1));
  }, [fileSearchResults.length, selectedSearchResultIndex]);

  const openSearchResultAndClose = useCallback(
    async (path: string) => {
      await openSearchResult(path);
      setIsFileSearchOpen(false);
    },
    [openSearchResult],
  );

  const openSelectedSearchResult = useCallback(async () => {
    const selectedResult = fileSearchResults[selectedSearchResultIndex];
    if (!selectedResult) {
      return;
    }

    await openSearchResultAndClose(selectedResult.path);
  }, [fileSearchResults, openSearchResultAndClose, selectedSearchResultIndex]);

  const handleFileSearchInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (fileSearchResults.length === 0) {
          return;
        }

        setSelectedSearchResultIndex((current) => Math.min(current + 1, fileSearchResults.length - 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (fileSearchResults.length === 0) {
          return;
        }

        setSelectedSearchResultIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void openSelectedSearchResult();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsFileSearchOpen(false);
      }
    },
    [fileSearchResults.length, openSelectedSearchResult],
  );

  return {
    isFileSearchOpen,
    setIsFileSearchOpen,
    fileSearchQuery,
    setFileSearchQuery,
    selectedSearchResultIndex,
    setSelectedSearchResultIndex,
    fileSearchResults,
    handleFileSearchInputKeyDown,
    openSearchResultAndClose,
  };
}
