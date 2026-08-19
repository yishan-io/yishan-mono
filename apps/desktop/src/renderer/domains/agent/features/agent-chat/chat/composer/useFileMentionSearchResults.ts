import { useEffect, useRef, useState } from "react";
import type { FileMentionResult } from "./richComposerTypes";

const FILE_MENTION_SEARCH_DEBOUNCE_MS = 120;

type FileMentionSearchResults = {
  results: FileMentionResult[];
  isSearching: boolean;
  hasSearchError: boolean;
};

/**
 * Runs an async file mention search with debouncing and stale-response guarding.
 * Results are cleared while a new query is in flight so stale entries can never be inserted.
 */
export function useFileMentionSearchResults(
  query: string | null,
  search?: (query: string) => Promise<FileMentionResult[]>,
): FileMentionSearchResults {
  const [results, setResults] = useState<FileMentionResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchError, setHasSearchError] = useState(false);
  const searchRequestIdRef = useRef(0);
  const trimmedQuery = query?.trim() || null;

  useEffect(() => {
    if (!search || trimmedQuery === null) {
      setResults([]);
      setIsSearching(false);
      setHasSearchError(false);
      return;
    }

    searchRequestIdRef.current += 1;
    const requestId = searchRequestIdRef.current;
    setResults([]);
    setHasSearchError(false);
    setIsSearching(true);

    const timeoutId = setTimeout(() => {
      Promise.resolve()
        .then(() => search(trimmedQuery))
        .then((nextResults) => {
          if (requestId === searchRequestIdRef.current) {
            setResults(nextResults);
            setIsSearching(false);
          }
        })
        .catch(() => {
          if (requestId === searchRequestIdRef.current) {
            setResults([]);
            setIsSearching(false);
            setHasSearchError(true);
          }
        });
    }, FILE_MENTION_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
      if (requestId === searchRequestIdRef.current) {
        searchRequestIdRef.current += 1;
      }
    };
  }, [search, trimmedQuery]);

  return { results, isSearching, hasSearchError };
}
