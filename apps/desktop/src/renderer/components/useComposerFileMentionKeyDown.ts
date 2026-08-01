import type { KeyboardEvent } from "react";
import { useCallback } from "react";
import type { ComposerTokenRange, FileMentionResult } from "./richComposerTypes";

type UseComposerFileMentionKeyDownOptions = {
  disabled: boolean;
  activeMentionRange: ComposerTokenRange | null;
  mentionResults: FileMentionResult[];
  selectedMentionIndex: number;
  isSearching: boolean;
  hasSearchError: boolean;
  setActiveMentionRange: (range: ComposerTokenRange | null) => void;
  setSelectedMentionIndex: (updater: number | ((prev: number) => number)) => void;
  insertMentionFile: (result: FileMentionResult) => void;
};

/**
 * Builds the mention-menu keydown handler. Returns true when the event was consumed.
 * Enter/Tab is consumed while results load or the search failed; with finished empty
 * results the menu closes and the event falls through to normal composer behavior.
 */
export function useComposerFileMentionKeyDown({
  disabled,
  activeMentionRange,
  mentionResults,
  selectedMentionIndex,
  isSearching,
  hasSearchError,
  setActiveMentionRange,
  setSelectedMentionIndex,
  insertMentionFile,
}: UseComposerFileMentionKeyDownOptions): (event: KeyboardEvent<HTMLDivElement>) => boolean {
  return useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled || !activeMentionRange) {
        return false;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveMentionRange(null);
        return true;
      }

      if (event.key === "ArrowDown") {
        if (mentionResults.length === 0) {
          return false;
        }
        event.preventDefault();
        setSelectedMentionIndex((currentIndex) => (currentIndex + 1) % mentionResults.length);
        return true;
      }

      if (event.key === "ArrowUp") {
        if (mentionResults.length === 0) {
          return false;
        }
        event.preventDefault();
        setSelectedMentionIndex((currentIndex) => (currentIndex - 1 + mentionResults.length) % mentionResults.length);
        return true;
      }

      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.nativeEvent.isComposing) {
        const selectedResult = mentionResults[selectedMentionIndex];
        if (selectedResult) {
          event.preventDefault();
          insertMentionFile(selectedResult);
          return true;
        }
        if (isSearching || hasSearchError) {
          // Keep Enter/Tab out of the submit path while results are loading or the search failed.
          event.preventDefault();
          return true;
        }
        // Search finished with no results: close the menu and let Enter behave normally.
        setActiveMentionRange(null);
        return false;
      }

      return false;
    },
    [
      activeMentionRange,
      disabled,
      hasSearchError,
      insertMentionFile,
      isSearching,
      mentionResults,
      selectedMentionIndex,
      setActiveMentionRange,
      setSelectedMentionIndex,
    ],
  );
}
