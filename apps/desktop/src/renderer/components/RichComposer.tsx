import { Box, Typography } from "@mui/material";
import type { ClipboardEvent, KeyboardEvent, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RichComposerSlashCommandMenu } from "./RichComposerSlashCommandMenu";
import {
  findSlashCommandRange,
  getCaretOffset,
  matchesSlashCommand,
  normalizeComposerText,
  renderComposerHtml,
  setCaretOffset,
} from "./richComposerHelpers";
import type { RichComposerSlashCommand, SlashCommandRange } from "./richComposerTypes";

export type { RichComposerSlashCommand } from "./richComposerTypes";

type RichComposerProps = {
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void | Promise<void>;
  minHeight?: number;
  disabled?: boolean;
  slashCommands?: RichComposerSlashCommand[];
  focusShortcutHint?: string;
};

/** Rich text-like contenteditable composer with token highlighting and slash command completion. */
export function RichComposer({
  placeholder,
  value,
  onChange,
  onSubmit,
  minHeight = 84,
  disabled = false,
  slashCommands = [],
  focusShortcutHint,
}: RichComposerProps) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const shouldMoveCaretToEndAfterFileDropRef = useRef(false);
  const [activeSlashCommandRange, setActiveSlashCommandRange] = useState<SlashCommandRange | null>(null);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [isComposerFocused, setIsComposerFocused] = useState(false);

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
      const nextHtml = renderComposerHtml(nextValue, slashCommands);

      onChange?.(nextValue);

      if (editable.innerHTML !== nextHtml) {
        editable.innerHTML = nextHtml;
        setCaretOffset(editable, caretOffset);
      }

      syncSlashCommandMenu(editable, nextValue, caretOffset);
    },
    [disabled, onChange, slashCommands, syncSlashCommandMenu],
  );

  const handleComposerSelectionChange = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      const editable = event.currentTarget;
      const nextValue = normalizeComposerText(editable.innerText);
      syncSlashCommandMenu(editable, nextValue, getCaretOffset(editable));
    },
    [syncSlashCommandMenu],
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
    [activeSlashCommandRange, onChange, slashCommands],
  );

  const handleComposerPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      event.preventDefault();
      const plainText = event.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, plainText);
    },
    [disabled],
  );

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) {
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
      if (!nextValue) {
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
      disabled,
      filteredSlashCommands,
      insertSlashCommand,
      onChange,
      onSubmit,
      selectedSlashCommandIndex,
      value,
    ],
  );

  useEffect(() => {
    const editable = composerRef.current;
    if (!editable || value === undefined) {
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
  }, [slashCommands, value]);

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

  return (
    <>
      <Box sx={{ position: "relative" }}>
        {!disabled && !isComposerFocused && focusShortcutHint ? (
          <Typography
            variant="caption"
            sx={{
              position: "absolute",
              top: 6,
              right: 8,
              zIndex: 1,
              color: "text.disabled",
              pointerEvents: "none",
            }}
          >
            {focusShortcutHint}
          </Typography>
        ) : null}
        <Box
          ref={composerRef}
          component="div"
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          aria-label={placeholder}
          aria-disabled={disabled}
          data-placeholder={placeholder}
          onFocus={() => setIsComposerFocused(true)}
          onBlur={() => setIsComposerFocused(false)}
          onInput={handleComposerInput}
          onPaste={handleComposerPaste}
          onKeyDown={handleComposerKeyDown}
          onClick={handleComposerSelectionChange}
          onKeyUp={handleComposerSelectionChange}
          sx={{
            p: 1.5,
            minHeight,
            outline: "none",
            typography: "body2",
            color: "text.primary",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowY: "auto",
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? "not-allowed" : "text",
            pointerEvents: disabled ? "none" : "auto",
            "&:empty:before": {
              content: "attr(data-placeholder)",
              color: "text.disabled",
            },
            "& .composer-link": {
              color: "primary.main",
              textDecoration: "underline",
            },
            "& .composer-slash": {
              fontWeight: 600,
            },
            "& .composer-slash-skill": {
              color: "warning.main",
            },
            "& .composer-slash-agent": {
              color: "#8b5cf6",
            },
            "& .composer-mention": {
              color: "success.main",
            },
          }}
        />
      </Box>
      <RichComposerSlashCommandMenu
        anchorEl={composerRef.current}
        open={activeSlashCommandRange !== null}
        commands={filteredSlashCommands}
        selectedCommandId={filteredSlashCommands[selectedSlashCommandIndex]?.id}
        onClose={() => {
          setActiveSlashCommandRange(null);
        }}
        onSelect={insertSlashCommand}
      />
    </>
  );
}
