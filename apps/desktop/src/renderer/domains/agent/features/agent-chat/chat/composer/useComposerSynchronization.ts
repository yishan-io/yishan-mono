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
  const shouldInsertLiteralSpaceAfterCompositionRef = useRef(false);
  useComposerLiteralSpaceRecovery(composerRef, shouldInsertLiteralSpaceAfterCompositionRef);

  const isAwaitingFinalInputRef = useRef(false);
  const compositionInputValueRef = useRef<string | null>(null);
  const pendingExternalValueRef = useRef<string | null>(null);
  const [isReadyToSynchronizeControlledValue, setIsReadyToSynchronizeControlledValue] = useState(true);

  const synchronizeComposer = useCallback(
    (editable: HTMLDivElement, nextValue: string, caretOffset: number) => {
      const nextHtml = renderComposerHtml(nextValue, slashCommands);
      if (shouldSynchronizeComposerMarkup(editable, nextHtml) && editable.innerHTML !== nextHtml) {
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
    shouldInsertLiteralSpaceAfterCompositionRef.current = false;
    compositionInputValueRef.current = null;
    pendingExternalValueRef.current = null;
    setIsReadyToSynchronizeControlledValue(false);
    closeSuggestionMenus();
  }, [closeSuggestionMenus, isComposingRef]);

  const handleComposerCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    // macOS Pinyin commits through insertCompositionText and emits no later
    // non-composing input. Treat compositionend as the completed transaction,
    // unless a controlled external value must still replace the composition.
    if (pendingExternalValueRef.current !== null) {
      isAwaitingFinalInputRef.current = true;
      return;
    }
    shouldInsertLiteralSpaceAfterCompositionRef.current = true;
    isAwaitingFinalInputRef.current = false;
    setIsReadyToSynchronizeControlledValue(true);
  }, [isComposingRef, shouldInsertLiteralSpaceAfterCompositionRef]);

  const handleComposerInput = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }

      const editable = event.currentTarget;
      const nativeEvent = event.nativeEvent as InputEvent;
      if (nativeEvent.inputType === "insertFromDrop") {
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
    const shouldSynchronizeDom =
      normalizedCurrentValue !== value || shouldSynchronizeComposerMarkup(editable, nextHtml);
    if (!shouldSynchronizeDom || editable.innerHTML === nextHtml) {
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

function useComposerLiteralSpaceRecovery(
  composerRef: RefObject<HTMLDivElement | null>,
  shouldInsertLiteralSpaceRef: RefObject<boolean>,
): void {
  useEffect(() => {
    const editable = composerRef.current;
    if (!editable) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldInsertLiteralSpaceRef.current || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key !== " ") {
        if (event.key.length === 1) {
          shouldInsertLiteralSpaceRef.current = false;
        }
        return;
      }

      // macOS Pinyin can consume this literal space without dispatching
      // beforeinput/input after compositionend. Insert it through the browser's
      // editing command so the regular input handler receives the update.
      shouldInsertLiteralSpaceRef.current = false;
      event.preventDefault();
      document.execCommand("insertText", false, " ");
    };

    editable.addEventListener("keydown", handleKeyDown);
    return () => {
      editable.removeEventListener("keydown", handleKeyDown);
    };
  }, [composerRef, shouldInsertLiteralSpaceRef]);
}

function shouldSynchronizeComposerMarkup(editable: HTMLDivElement, nextHtml: string): boolean {
  return (
    nextHtml.includes("<a ") ||
    nextHtml.includes("<span ") ||
    nextHtml.includes("<br>") ||
    editable.querySelector("a.composer-link, span.composer-slash, span.composer-mention") !== null
  );
}
