import type { RefObject } from "react";
import { useCallback, useEffect } from "react";
import {
  focusComposer,
  getComposerText,
  hasComposerHtml,
  setComposerCaretOffset,
  setComposerContent,
} from "./composerDom";
import { renderComposerHtml } from "./richComposerText";
import type { RichComposerSlashCommand } from "./richComposerTypes";

type UseComposerControlledValueSynchronizationOptions = {
  composerRef: RefObject<HTMLDivElement | null>;
  value?: string;
  slashCommands: RichComposerSlashCommand[];
  shouldMoveCaretToEndAfterFileDropRef: RefObject<boolean>;
  isReadyToSynchronizeControlledValue: boolean;
  queueExternalValue: (value: string) => boolean;
  syncSuggestionMenus: (editable: HTMLDivElement, value: string, caretOffset: number) => void;
};

/** Synchronizes controlled draft values without disturbing active native composition. */
export function useComposerControlledValueSynchronization({
  composerRef,
  value,
  slashCommands,
  shouldMoveCaretToEndAfterFileDropRef,
  isReadyToSynchronizeControlledValue,
  queueExternalValue,
  syncSuggestionMenus,
}: UseComposerControlledValueSynchronizationOptions) {
  const synchronizeComposer = useCallback(
    (editable: HTMLDivElement, nextValue: string, caretOffset: number) => {
      const nextHtml = renderComposerHtml(nextValue, slashCommands);
      if (shouldSynchronizeComposerMarkup(editable, nextHtml) && !hasComposerHtml(editable, nextHtml)) {
        setComposerContent(editable, nextValue, slashCommands);
        setComposerCaretOffset(editable, caretOffset);
      }
      syncSuggestionMenus(editable, nextValue, caretOffset);
    },
    [slashCommands, syncSuggestionMenus],
  );

  useEffect(() => {
    const editable = composerRef.current;
    if (!editable || value === undefined || queueExternalValue(value) || !isReadyToSynchronizeControlledValue) return;
    const nextHtml = renderComposerHtml(value, slashCommands);
    const shouldMoveCaretToEndAfterFileDrop = shouldMoveCaretToEndAfterFileDropRef.current;
    const shouldSynchronizeDom =
      getComposerText(editable) !== value || shouldSynchronizeComposerMarkup(editable, nextHtml);
    if (!shouldSynchronizeDom || hasComposerHtml(editable, nextHtml)) {
      if (shouldMoveCaretToEndAfterFileDrop) restoreComposerFocusAndCaret(editable, value.length);
      shouldMoveCaretToEndAfterFileDropRef.current = false;
      return;
    }
    if (document.activeElement === editable || shouldMoveCaretToEndAfterFileDrop) {
      setComposerContent(editable, value, slashCommands);
      restoreComposerFocusAndCaret(editable, value.length);
    } else {
      setComposerContent(editable, value, slashCommands);
    }
    shouldMoveCaretToEndAfterFileDropRef.current = false;
  }, [
    composerRef,
    isReadyToSynchronizeControlledValue,
    queueExternalValue,
    slashCommands,
    shouldMoveCaretToEndAfterFileDropRef,
    value,
  ]);

  return { synchronizeComposer };
}

function restoreComposerFocusAndCaret(editable: HTMLDivElement, caretOffset: number): void {
  focusComposer(editable);
  setComposerCaretOffset(editable, caretOffset);
}

function shouldSynchronizeComposerMarkup(editable: HTMLDivElement, nextHtml: string): boolean {
  return (
    nextHtml.includes("<a ") ||
    nextHtml.includes("<span ") ||
    nextHtml.includes("<br>") ||
    editable.querySelector("a.composer-link, span.composer-slash, span.composer-mention") !== null
  );
}
