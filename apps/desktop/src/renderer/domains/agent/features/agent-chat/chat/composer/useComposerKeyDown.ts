import type { KeyboardEvent } from "react";
import { useCallback, useRef } from "react";
import { normalizeComposerText } from "./richComposerText";
import type { ComposerTokenRange, RichComposerSlashCommand } from "./richComposerTypes";

type UseComposerKeyDownOptions = {
  disabled: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => unknown;
  allowEmptySubmit: boolean;
  activeSlashCommandRange: ComposerTokenRange | null;
  setActiveSlashCommandRange: (range: ComposerTokenRange | null) => void;
  selectedSlashCommandIndex: number;
  setSelectedSlashCommandIndex: (updater: number | ((prev: number) => number)) => void;
  filteredSlashCommands: RichComposerSlashCommand[];
  insertSlashCommand: (command: RichComposerSlashCommand) => void;
  handleMentionComposerKeyDown: (event: KeyboardEvent<HTMLDivElement>) => boolean;
};

/** Builds the composer keydown handler: mention menu, slash command menu, then submit. */
export function useComposerKeyDown({
  disabled,
  value,
  onChange,
  onSubmit,
  allowEmptySubmit,
  activeSlashCommandRange,
  setActiveSlashCommandRange,
  selectedSlashCommandIndex,
  setSelectedSlashCommandIndex,
  filteredSlashCommands,
  insertSlashCommand,
  handleMentionComposerKeyDown,
}: UseComposerKeyDownOptions): (event: KeyboardEvent<HTMLDivElement>) => void {
  const submittingRef = useRef(false);
  return useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }

      if (handleMentionComposerKeyDown(event)) {
        return;
      }

      if (activeSlashCommandRange) {
        if (event.key === "Escape") {
          event.preventDefault();
          setActiveSlashCommandRange(null);
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedSlashCommandIndex((currentIndex) => {
            if (filteredSlashCommands.length === 0) {
              return 0;
            }
            return (currentIndex + 1) % filteredSlashCommands.length;
          });
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedSlashCommandIndex((currentIndex) => {
            if (filteredSlashCommands.length === 0) {
              return 0;
            }
            return (currentIndex - 1 + filteredSlashCommands.length) % filteredSlashCommands.length;
          });
          return;
        }

        if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.nativeEvent.isComposing) {
          const selectedSlashCommand = filteredSlashCommands[selectedSlashCommandIndex];
          if (selectedSlashCommand) {
            event.preventDefault();
            insertSlashCommand(selectedSlashCommand);
            return;
          }
        }
      }

      if (!onSubmit) {
        return;
      }

      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
        return;
      }

      // Ignore Enter while a submit is in flight so a quick Enter-Enter cannot
      // double-send the same prompt.
      if (submittingRef.current) {
        return;
      }

      event.preventDefault();
      const editable = event.currentTarget;
      const nextValue = normalizeComposerText(editable.innerText).trim();
      if (!nextValue && !allowEmptySubmit) {
        return;
      }

      submittingRef.current = true;
      void Promise.resolve(onSubmit(nextValue)).then(
        (result) => {
          submittingRef.current = false;
          // A resolved `false` means the submit failed (the caller surfaced the
          // error itself); keep the draft so the user can retry without
          // retyping.
          if (result === false) {
            return;
          }
          if (value === undefined) {
            editable.innerHTML = "";
          }
          onChange?.("");
          setActiveSlashCommandRange(null);
        },
        () => {
          submittingRef.current = false;
          // Keep the draft and the active slash-command range when the submit
          // failed so the user can retry without retyping.
        },
      );
    },
    [
      activeSlashCommandRange,
      allowEmptySubmit,
      disabled,
      filteredSlashCommands,
      handleMentionComposerKeyDown,
      insertSlashCommand,
      onChange,
      onSubmit,
      selectedSlashCommandIndex,
      setActiveSlashCommandRange,
      setSelectedSlashCommandIndex,
      value,
    ],
  );
}
