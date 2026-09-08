import type { RefObject, SyntheticEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCaretOffset, normalizeComposerText, renderComposerHtml, setCaretOffset } from "./richComposerText";
import type { RichComposerSlashCommand } from "./richComposerTypes";

type UseComposerSynchronizationOptions = {
  composerRef: RefObject<HTMLDivElement | null>;
  isComposingRef: RefObject<boolean>;
  disabled: boolean;
  value?: string;
  onChange?: (value: string) => void;
  slashCommands: RichComposerSlashCommand[];
  shouldMoveCaretToEndAfterFileDropRef: RefObject<boolean>;
  syncSlashCommandMenu: (editable: HTMLDivElement, value: string, caretOffset: number) => void;
  syncMentionMenu: (editable: HTMLDivElement, value: string, caretOffset: number) => void;
  closeSuggestionMenus: () => void;
};

/** Coordinates contenteditable DOM updates around IME composition and controlled values. */
export function useComposerSynchronization({
  composerRef,
  isComposingRef,
  disabled,
  value,
  onChange,
  slashCommands,
  shouldMoveCaretToEndAfterFileDropRef,
  syncSlashCommandMenu,
  syncMentionMenu,
  closeSuggestionMenus,
}: UseComposerSynchronizationOptions) {
  const isAwaitingFinalInputRef = useRef(false);
  const compositionInputValueRef = useRef<string | null>(null);
  const pendingExternalValueRef = useRef<string | null>(null);
  const [isReadyToSynchronizeControlledValue, setIsReadyToSynchronizeControlledValue] = useState(true);

  const synchronizeComposer = useCallback(
    (editable: HTMLDivElement, nextValue: string, caretOffset: number) => {
      const nextHtml = renderComposerHtml(nextValue, slashCommands);
      if (editable.innerHTML !== nextHtml) {
        editable.innerHTML = nextHtml;
        setCaretOffset(editable, caretOffset);
      }
      syncSlashCommandMenu(editable, nextValue, caretOffset);
      syncMentionMenu(editable, nextValue, caretOffset);
    },
    [slashCommands, syncMentionMenu, syncSlashCommandMenu],
  );

  const handleComposerCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    isAwaitingFinalInputRef.current = false;
    compositionInputValueRef.current = null;
    pendingExternalValueRef.current = null;
    setIsReadyToSynchronizeControlledValue(false);
    closeSuggestionMenus();
  }, [closeSuggestionMenus, isComposingRef]);

  const handleComposerCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    // Browsers dispatch the committed non-composing input after compositionend.
    // Do not rewrite innerHTML here: it would interrupt that final input.
    isAwaitingFinalInputRef.current = true;
  }, [isComposingRef]);

  const handleComposerInput = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }

      const editable = event.currentTarget;
      if ((event.nativeEvent as InputEvent).inputType === "insertFromDrop") {
        shouldMoveCaretToEndAfterFileDropRef.current = true;
      }
      const caretOffset = getCaretOffset(editable);
      const nextValue = normalizeComposerText(editable.innerText);
      if (isComposingRef.current) {
        compositionInputValueRef.current = nextValue;
        onChange?.(nextValue);
        return;
      }

      const pendingExternalValue = pendingExternalValueRef.current;
      if (pendingExternalValue !== null) {
        pendingExternalValueRef.current = null;
        isAwaitingFinalInputRef.current = false;
        synchronizeComposer(editable, pendingExternalValue, pendingExternalValue.length);
        setIsReadyToSynchronizeControlledValue(true);
        return;
      }

      const isFinalCompositionInput = isAwaitingFinalInputRef.current;
      onChange?.(nextValue);
      isAwaitingFinalInputRef.current = false;
      if (isFinalCompositionInput) {
        // The browser can still be completing its native IME transaction after
        // this input. Rewriting contenteditable here can consume the first
        // subsequent Space key; defer markup normalization to the next input.
        syncSlashCommandMenu(editable, nextValue, caretOffset);
        syncMentionMenu(editable, nextValue, caretOffset);
      } else {
        synchronizeComposer(editable, nextValue, caretOffset);
      }
      setIsReadyToSynchronizeControlledValue(true);
    },
    [disabled, isComposingRef, onChange, shouldMoveCaretToEndAfterFileDropRef, synchronizeComposer],
  );

  useEffect(() => {
    const editable = composerRef.current;
    if (!editable || value === undefined) {
      return;
    }

    if (isComposingRef.current) {
      if (value !== compositionInputValueRef.current) {
        pendingExternalValueRef.current = value;
      }
      return;
    }

    if (!isReadyToSynchronizeControlledValue || isAwaitingFinalInputRef.current) {
      return;
    }

    const normalizedCurrentValue = normalizeComposerText(editable.innerText);
    const nextHtml = renderComposerHtml(value, slashCommands);
    const shouldMoveCaretToEndAfterFileDrop = shouldMoveCaretToEndAfterFileDropRef.current;
    if (normalizedCurrentValue === value && editable.innerHTML === nextHtml) {
      if (shouldMoveCaretToEndAfterFileDrop) {
        editable.focus();
        setCaretOffset(editable, value.length);
        shouldMoveCaretToEndAfterFileDropRef.current = false;
      }
      return;
    }

    const shouldRestoreCaret = document.activeElement === editable;
    editable.innerHTML = nextHtml;
    if (shouldRestoreCaret || shouldMoveCaretToEndAfterFileDrop) {
      editable.focus();
      setCaretOffset(editable, value.length);
    }
    shouldMoveCaretToEndAfterFileDropRef.current = false;
  }, [
    composerRef,
    isComposingRef,
    isReadyToSynchronizeControlledValue,
    slashCommands,
    shouldMoveCaretToEndAfterFileDropRef,
    value,
  ]);

  return {
    handleComposerCompositionStart,
    handleComposerCompositionEnd,
    handleComposerInput,
  };
}
