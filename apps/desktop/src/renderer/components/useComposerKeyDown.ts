import type { KeyboardEvent } from "react";
import { useCallback } from "react";
import { normalizeComposerText } from "./richComposerHelpers";
import type { ComposerTokenRange, RichComposerSlashCommand } from "./richComposerTypes";

type UseComposerKeyDownOptions = {
  disabled: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void | Promise<void>;
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

      event.preventDefault();
      const editable = event.currentTarget;
      const nextValue = normalizeComposerText(editable.innerText).trim();
      if (!nextValue && !allowEmptySubmit) {
        return;
      }

      void onSubmit(nextValue);
      if (value === undefined) {
        editable.innerHTML = "";
      }
      onChange?.("");
      setActiveSlashCommandRange(null);
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
