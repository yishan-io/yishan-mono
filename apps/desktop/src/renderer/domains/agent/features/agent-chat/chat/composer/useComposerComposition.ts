import type { RefObject, SyntheticEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getComposerText, insertComposerLiteralSpace } from "./composerDom";

type UseComposerCompositionOptions = {
  composerRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  value?: string;
  onChange?: (value: string) => void;
  closeSuggestionMenus: () => void;
};

type ComposerInputResult =
  | { kind: "composing" }
  | { kind: "queuedExternalValue"; value: string }
  | { kind: "value"; isDuplicateCompositionEndInput: boolean; isFinalCompositionInput: boolean };

/** Owns native IME composition phases and their browser-specific completion timing. */
export function useComposerComposition({
  composerRef,
  disabled,
  value,
  onChange,
  closeSuggestionMenus,
}: UseComposerCompositionOptions) {
  const isComposingRef = useRef(false);
  const isAwaitingFinalInputRef = useRef(false);
  const compositionEndSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFinalInputBeforeCompositionEndRef = useRef(false);
  const compositionEndValueRef = useRef<string | null>(null);
  const compositionInputValueRef = useRef<string | null>(null);
  const pendingExternalValueRef = useRef<string | null>(null);
  const shouldInsertLiteralSpaceRef = useRef(false);
  const [isReadyToSynchronizeControlledValue, setIsReadyToSynchronizeControlledValue] = useState(true);

  useComposerLiteralSpaceRecovery(composerRef, shouldInsertLiteralSpaceRef);
  useEffect(() => () => clearCompositionEndTimeout(compositionEndSyncTimeoutRef), []);

  const releaseControlledValueSynchronization = useCallback(() => {
    isAwaitingFinalInputRef.current = false;
    compositionEndSyncTimeoutRef.current = null;
    setIsReadyToSynchronizeControlledValue(true);
  }, []);

  const scheduleControlledValueSynchronization = useCallback(() => {
    compositionEndSyncTimeoutRef.current = setTimeout(releaseControlledValueSynchronization, 0);
  }, [releaseControlledValueSynchronization]);

  const handleComposerCompositionStart = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      clearCompositionEndTimeout(compositionEndSyncTimeoutRef);
      isComposingRef.current = true;
      isAwaitingFinalInputRef.current = false;
      hasFinalInputBeforeCompositionEndRef.current = false;
      compositionEndValueRef.current = null;
      compositionInputValueRef.current = value === undefined ? getComposerText(event.currentTarget) : value;
      pendingExternalValueRef.current = null;
      shouldInsertLiteralSpaceRef.current = false;
      setIsReadyToSynchronizeControlledValue(false);
      closeSuggestionMenus();
    },
    [closeSuggestionMenus, value],
  );

  const handleComposerCompositionEnd = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      isComposingRef.current = false;
      const committedValue = getComposerText(event.currentTarget);
      if (!disabled) compositionEndValueRef.current = committedValue;
      if (pendingExternalValueRef.current !== null) {
        isAwaitingFinalInputRef.current = true;
        scheduleControlledValueSynchronization();
        return;
      }
      if (!disabled && committedValue !== compositionInputValueRef.current) {
        onChange?.(committedValue);
      }
      shouldInsertLiteralSpaceRef.current = true;
      if (hasFinalInputBeforeCompositionEndRef.current) {
        setIsReadyToSynchronizeControlledValue(true);
        return;
      }
      isAwaitingFinalInputRef.current = true;
      scheduleControlledValueSynchronization();
    },
    [disabled, onChange, scheduleControlledValueSynchronization],
  );

  const handleComposerInput = useCallback(
    (event: SyntheticEvent<HTMLDivElement>): ComposerInputResult => {
      clearCompositionEndTimeout(compositionEndSyncTimeoutRef);
      const nativeEvent = event.nativeEvent as InputEvent;
      if (isComposingRef.current) {
        if (!nativeEvent.isComposing || nativeEvent.inputType === "insertText") {
          hasFinalInputBeforeCompositionEndRef.current = true;
        }
        return { kind: "composing" };
      }
      const pendingExternalValue = pendingExternalValueRef.current;
      if (pendingExternalValue !== null) {
        pendingExternalValueRef.current = null;
        releaseControlledValueSynchronization();
        return { kind: "queuedExternalValue", value: pendingExternalValue };
      }
      const nextValue = getComposerText(event.currentTarget);
      const isDuplicateCompositionEndInput = compositionEndValueRef.current === nextValue;
      compositionEndValueRef.current = null;
      const isFinalCompositionInput = isAwaitingFinalInputRef.current;
      releaseControlledValueSynchronization();
      return { kind: "value", isDuplicateCompositionEndInput, isFinalCompositionInput };
    },
    [releaseControlledValueSynchronization],
  );

  const queueExternalValue = useCallback((nextValue: string): boolean => {
    if (!isComposingRef.current || nextValue === compositionInputValueRef.current) {
      return false;
    }
    pendingExternalValueRef.current = nextValue;
    return true;
  }, []);

  return {
    isComposingRef,
    isReadyToSynchronizeControlledValue,
    handleComposerCompositionStart,
    handleComposerCompositionEnd,
    handleComposerInput,
    queueExternalValue,
  };
}

function clearCompositionEndTimeout(timeoutRef: RefObject<ReturnType<typeof setTimeout> | null>): void {
  if (timeoutRef.current !== null) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

function useComposerLiteralSpaceRecovery(
  composerRef: RefObject<HTMLDivElement | null>,
  shouldInsertLiteralSpaceRef: RefObject<boolean>,
): void {
  useEffect(() => {
    const editable = composerRef.current;
    if (!editable) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldInsertLiteralSpaceRef.current || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (event.key !== " ") {
        if (event.key.length === 1) shouldInsertLiteralSpaceRef.current = false;
        return;
      }
      shouldInsertLiteralSpaceRef.current = false;
      event.preventDefault();
      insertComposerLiteralSpace(editable);
    };
    editable.addEventListener("keydown", handleKeyDown);
    return () => editable.removeEventListener("keydown", handleKeyDown);
  }, [composerRef, shouldInsertLiteralSpaceRef]);
}
