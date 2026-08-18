import type { KeyboardEvent, RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import { findMentionRange, normalizeComposerText, renderComposerHtml, setCaretOffset } from "./richComposerHelpers";
import type { ComposerTokenRange, FileMentionResult, RichComposerSlashCommand } from "./richComposerTypes";
import { useComposerFileMentionKeyDown } from "./useComposerFileMentionKeyDown";
import { useFileMentionSearchResults } from "./useFileMentionSearchResults";

type UseComposerFileMentionMenuOptions = {
  disabled: boolean;
  composerRef: RefObject<HTMLDivElement | null>;
  onChange?: (value: string) => void;
  slashCommands: RichComposerSlashCommand[];
  fileMentionSearch?: (query: string) => Promise<FileMentionResult[]>;
  onMentionFile?: (path: string, isDirectory: boolean) => void;
};

type UseComposerFileMentionMenuResult = {
  activeMentionRange: ComposerTokenRange | null;
  setActiveMentionRange: (range: ComposerTokenRange | null) => void;
  selectedMentionIndex: number;
  setSelectedMentionIndex: (updater: number | ((prev: number) => number)) => void;
  mentionResults: FileMentionResult[];
  isSearching: boolean;
  hasSearchError: boolean;
  syncMentionMenu: (editable: HTMLDivElement, value: string, caretOffset: number) => void;
  insertMentionFile: (result: FileMentionResult) => void;
  handleMentionComposerKeyDown: (event: KeyboardEvent<HTMLDivElement>) => boolean;
};

/** Manages the @ file mention menu state, async search, and insertion. */
export function useComposerFileMentionMenu({
  disabled,
  composerRef,
  onChange,
  slashCommands,
  fileMentionSearch,
  onMentionFile,
}: UseComposerFileMentionMenuOptions): UseComposerFileMentionMenuResult {
  const [activeMentionRange, setActiveMentionRange] = useState<ComposerTokenRange | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const mentionQuery = activeMentionRange?.query ?? null;
  const {
    results: mentionResults,
    isSearching,
    hasSearchError,
  } = useFileMentionSearchResults(mentionQuery, fileMentionSearch);

  const syncMentionMenu = useCallback(
    (editable: HTMLDivElement, value: string, caretOffset: number) => {
      if (disabled || !fileMentionSearch || !onMentionFile) {
        setActiveMentionRange(null);
        return;
      }
      setActiveMentionRange(findMentionRange(value, caretOffset));
    },
    [disabled, fileMentionSearch, onMentionFile],
  );

  const insertMentionFile = useCallback(
    (result: FileMentionResult) => {
      const editable = composerRef.current;
      const activeRange = activeMentionRange;
      if (!editable || !activeRange) {
        return;
      }

      const currentValue = normalizeComposerText(editable.innerText);
      const nextValue = currentValue.slice(0, activeRange.start) + currentValue.slice(activeRange.end);
      editable.innerHTML = renderComposerHtml(nextValue, slashCommands);
      setCaretOffset(editable, activeRange.start);
      editable.focus();
      onChange?.(nextValue);
      setActiveMentionRange(null);
      onMentionFile?.(result.path, result.isDirectory ?? false);
    },
    [activeMentionRange, composerRef, onChange, onMentionFile, slashCommands],
  );

  const handleMentionComposerKeyDown = useComposerFileMentionKeyDown({
    disabled,
    activeMentionRange,
    mentionResults,
    selectedMentionIndex,
    isSearching,
    hasSearchError,
    setActiveMentionRange,
    setSelectedMentionIndex,
    insertMentionFile,
  });

  useEffect(() => {
    if (disabled) {
      setActiveMentionRange(null);
      setSelectedMentionIndex(0);
    }
    if (!activeMentionRange || mentionResults.length === 0) {
      setSelectedMentionIndex(0);
      return;
    }
    setSelectedMentionIndex((currentIndex) => Math.min(currentIndex, mentionResults.length - 1));
  }, [activeMentionRange, disabled, mentionResults.length]);

  return {
    activeMentionRange,
    setActiveMentionRange,
    selectedMentionIndex,
    setSelectedMentionIndex,
    mentionResults,
    isSearching,
    hasSearchError,
    syncMentionMenu,
    insertMentionFile,
    handleMentionComposerKeyDown,
  };
}
