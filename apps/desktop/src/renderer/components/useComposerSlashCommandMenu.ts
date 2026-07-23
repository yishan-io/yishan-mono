import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  findSlashCommandRange,
  getCaretOffset,
  matchesSlashCommand,
  normalizeComposerText,
  renderComposerHtml,
  setCaretOffset,
} from "./richComposerHelpers";
import type { RichComposerSlashCommand, SlashCommandRange } from "./richComposerTypes";

type UseComposerSlashCommandMenuOptions = {
  disabled: boolean;
  slashCommands: RichComposerSlashCommand[];
  composerRef: RefObject<HTMLDivElement | null>;
  onChange?: (value: string) => void;
};

type UseComposerSlashCommandMenuResult = {
  activeSlashCommandRange: SlashCommandRange | null;
  setActiveSlashCommandRange: (range: SlashCommandRange | null) => void;
  selectedSlashCommandIndex: number;
  setSelectedSlashCommandIndex: (updater: number | ((prev: number) => number)) => void;
  filteredSlashCommands: RichComposerSlashCommand[];
  syncSlashCommandMenu: (editable: HTMLDivElement, value: string, caretOffset: number) => void;
  insertSlashCommand: (command: RichComposerSlashCommand) => void;
};

/** Manages slash-command menu state, filtering, insertion, and index sync for the composer. */
export function useComposerSlashCommandMenu({
  disabled,
  slashCommands,
  composerRef,
  onChange,
}: UseComposerSlashCommandMenuOptions): UseComposerSlashCommandMenuResult {
  const [activeSlashCommandRange, setActiveSlashCommandRange] = useState<SlashCommandRange | null>(null);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);

  const filteredSlashCommands = useMemo(() => {
    if (!activeSlashCommandRange) {
      return [];
    }
    return slashCommands.filter((command) => matchesSlashCommand(command, activeSlashCommandRange.query));
  }, [activeSlashCommandRange, slashCommands]);

  const syncSlashCommandMenu = useCallback(
    (editable: HTMLDivElement, value: string, caretOffset: number) => {
      if (disabled || slashCommands.length === 0) {
        setActiveSlashCommandRange(null);
        return;
      }
      setActiveSlashCommandRange(findSlashCommandRange(value, caretOffset));
    },
    [disabled, slashCommands],
  );

  const insertSlashCommand = useCallback(
    (command: RichComposerSlashCommand) => {
      const editable = composerRef.current;
      const activeRange = activeSlashCommandRange;
      if (!editable || !activeRange) {
        return;
      }
      const currentValue = normalizeComposerText(editable.innerText);
      const insertedText = `${command.insertText ?? command.title} `;
      const nextValue = currentValue.slice(0, activeRange.start) + insertedText + currentValue.slice(activeRange.end);
      editable.innerHTML = renderComposerHtml(nextValue, slashCommands);
      setCaretOffset(editable, activeRange.start + insertedText.length);
      editable.focus();
      onChange?.(nextValue);
      setActiveSlashCommandRange(null);
    },
    [activeSlashCommandRange, composerRef, onChange, slashCommands],
  );

  useEffect(() => {
    if (disabled) {
      setActiveSlashCommandRange(null);
      setSelectedSlashCommandIndex(0);
    }
  }, [disabled]);

  useEffect(() => {
    if (!activeSlashCommandRange || filteredSlashCommands.length === 0) {
      setSelectedSlashCommandIndex(0);
      return;
    }
    setSelectedSlashCommandIndex((currentIndex) => Math.min(currentIndex, filteredSlashCommands.length - 1));
  }, [activeSlashCommandRange, filteredSlashCommands]);

  return {
    activeSlashCommandRange,
    setActiveSlashCommandRange,
    selectedSlashCommandIndex,
    setSelectedSlashCommandIndex,
    filteredSlashCommands,
    syncSlashCommandMenu,
    insertSlashCommand,
  };
}
