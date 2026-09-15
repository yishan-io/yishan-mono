import type { RefObject, SyntheticEvent } from "react";
import { useCallback } from "react";
import { getComposerCaretOffset, getComposerText } from "./composerDom";
import type { RichComposerSlashCommand } from "./richComposerTypes";
import { useComposerComposition } from "./useComposerComposition";
import { useComposerControlledValueSynchronization } from "./useComposerControlledValueSynchronization";

type SynchronizeSuggestionMenus = (editable: HTMLDivElement, value: string, caretOffset: number) => void;

type UseComposerSynchronizationOptions = {
  composerRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  value?: string;
  onChange?: (value: string) => void;
  slashCommands: RichComposerSlashCommand[];
  shouldMoveCaretToEndAfterFileDropRef: RefObject<boolean>;
  syncSuggestionMenusRef: RefObject<SynchronizeSuggestionMenus>;
  closeSuggestionMenusRef: RefObject<() => void>;
};

/** Facade retaining RichComposer's event handlers while delegating IME and controlled-value concerns. */
export function useComposerSynchronization({
  composerRef,
  disabled,
  value,
  onChange,
  slashCommands,
  shouldMoveCaretToEndAfterFileDropRef,
  syncSuggestionMenusRef,
  closeSuggestionMenusRef,
}: UseComposerSynchronizationOptions) {
  const composition = useComposerComposition({
    composerRef,
    disabled,
    value,
    onChange,
    closeSuggestionMenus: () => closeSuggestionMenusRef.current(),
  });
  const { synchronizeComposer } = useComposerControlledValueSynchronization({
    composerRef,
    value,
    slashCommands,
    shouldMoveCaretToEndAfterFileDropRef,
    isReadyToSynchronizeControlledValue: composition.isReadyToSynchronizeControlledValue,
    queueExternalValue: composition.queueExternalValue,
    syncSuggestionMenus: (editable, nextValue, caretOffset) =>
      syncSuggestionMenusRef.current(editable, nextValue, caretOffset),
  });

  const handleComposerInput = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      if (disabled) return;
      const editable = event.currentTarget;
      const nativeEvent = event.nativeEvent as InputEvent;
      if (nativeEvent.inputType === "insertFromDrop") shouldMoveCaretToEndAfterFileDropRef.current = true;
      const inputResult = composition.handleComposerInput(event);
      if (inputResult.kind === "composing") return;
      const caretOffset = getComposerCaretOffset(editable);
      if (inputResult.kind === "queuedExternalValue") {
        synchronizeComposer(editable, inputResult.value, inputResult.value.length);
        return;
      }
      const nextValue = getComposerText(editable);
      if (!inputResult.isDuplicateCompositionEndInput) onChange?.(nextValue);
      if (inputResult.isFinalCompositionInput) {
        syncSuggestionMenusRef.current(editable, nextValue, caretOffset);
      } else {
        synchronizeComposer(editable, nextValue, caretOffset);
      }
    },
    [
      composition,
      disabled,
      onChange,
      shouldMoveCaretToEndAfterFileDropRef,
      syncSuggestionMenusRef,
      synchronizeComposer,
    ],
  );

  return {
    isComposingRef: composition.isComposingRef,
    handleComposerCompositionStart: composition.handleComposerCompositionStart,
    handleComposerCompositionEnd: composition.handleComposerCompositionEnd,
    handleComposerInput,
  };
}
