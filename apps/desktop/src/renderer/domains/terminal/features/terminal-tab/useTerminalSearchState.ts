import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";

type UseTerminalSearchStateInput = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  xtermRef: RefObject<Terminal | null>;
  searchAddonRef: RefObject<SearchAddon | null>;
};

const TERMINAL_SEARCH_OPTIONS = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  incremental: true,
};

export function useTerminalSearchState({ searchInputRef, xtermRef, searchAddonRef }: UseTerminalSearchStateInput) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const clearTerminalSearchHighlights = useCallback((): void => {
    const searchAddon = searchAddonRef.current;
    if (!searchAddon) {
      return;
    }
    const searchAddonWithClear = searchAddon as unknown as {
      clearDecorations?: () => void;
      clearActiveDecoration?: () => void;
    };
    searchAddonWithClear.clearDecorations?.();
    searchAddonWithClear.clearActiveDecoration?.();
  }, [searchAddonRef]);

  const runTerminalSearch = useCallback(
    (direction: "next" | "previous"): void => {
      const searchAddon = searchAddonRef.current;
      const query = searchQuery.trim();
      if (!searchAddon || query.length === 0) {
        return;
      }
      if (direction === "next") {
        searchAddon.findNext(query, TERMINAL_SEARCH_OPTIONS);
        return;
      }
      searchAddon.findPrevious(query, TERMINAL_SEARCH_OPTIONS);
    },
    [searchAddonRef, searchQuery],
  );

  const closeSearchPanel = useCallback((): void => {
    setIsSearchOpen(false);
    setSearchQuery("");
    clearTerminalSearchHighlights();
    xtermRef.current?.focus();
  }, [clearTerminalSearchHighlights, xtermRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const activeElement = document.activeElement;
      const terminalInput = xtermRef.current?.textarea ?? null;
      const isSearchInputFocused = activeElement === searchInputRef.current;
      const isTerminalFocused = activeElement === terminalInput;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        if (!isTerminalFocused && !isSearchInputFocused) {
          return;
        }
        event.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      if (!isSearchOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeSearchPanel();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        runTerminalSearch(event.shiftKey ? "previous" : "next");
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSearchPanel, isSearchOpen, runTerminalSearch, searchInputRef, xtermRef]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isSearchOpen, searchInputRef]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }
    const query = searchQuery.trim();
    if (query.length === 0) {
      clearTerminalSearchHighlights();
      return;
    }
    searchAddonRef.current?.findNext(query, TERMINAL_SEARCH_OPTIONS);
  }, [clearTerminalSearchHighlights, isSearchOpen, searchAddonRef, searchQuery]);

  return {
    isSearchOpen,
    searchQuery,
    setSearchQuery,
    runTerminalSearch,
    closeSearchPanel,
  };
}
