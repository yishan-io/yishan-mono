import { Box, Typography } from "@mui/material";
import type { ClipboardEvent, KeyboardEvent, SyntheticEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileTreeDragEntry } from "./FileTree/dataTransfer";
import { RichComposerSlashCommandMenu } from "./RichComposerSlashCommandMenu";
import { getCaretOffset, normalizeComposerText, renderComposerHtml, setCaretOffset } from "./richComposerHelpers";
import type { RichComposerSlashCommand } from "./richComposerTypes";
import { useComposerFileDrop } from "./useComposerFileDrop";
import { useComposerSlashCommandMenu } from "./useComposerSlashCommandMenu";

export type { RichComposerSlashCommand } from "./richComposerTypes";
export type { FileTreeDragEntry as DroppedFileEntry } from "./FileTree/dataTransfer";

type RichComposerProps = {
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void | Promise<void>;
  minHeight?: number;
  disabled?: boolean;
  slashCommands?: RichComposerSlashCommand[];
  focusShortcutHint?: string;
  /** Allow Enter to submit even when the composer text is empty (e.g. when attachments are present). */
  allowEmptySubmit?: boolean;
  onFilesDrop?: (entries: FileTreeDragEntry[]) => void;
  onPasteBlock?: (text: string) => void;
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
  allowEmptySubmit = false,
  onFilesDrop,
  onPasteBlock,
}: RichComposerProps) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const shouldMoveCaretToEndAfterFileDropRef = useRef(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);

  const { isDragOver, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } = useComposerFileDrop({
    onFilesDrop,
  });

  const {
    activeSlashCommandRange,
    setActiveSlashCommandRange,
    selectedSlashCommandIndex,
    setSelectedSlashCommandIndex,
    filteredSlashCommands,
    syncSlashCommandMenu,
    insertSlashCommand,
  } = useComposerSlashCommandMenu({ disabled, slashCommands, composerRef, onChange });

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

  const handleComposerPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      event.preventDefault();
      const plainText = event.clipboardData.getData("text/plain");
      if (onPasteBlock && plainText.includes("\n") && plainText.split("\n").filter((l) => l.trim()).length >= 2) {
        onPasteBlock(plainText);
        return;
      }
      document.execCommand("insertText", false, plainText);
    },
    [disabled, onPasteBlock],
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
      insertSlashCommand,
      onChange,
      onSubmit,
      selectedSlashCommandIndex,
      setActiveSlashCommandRange,
      setSelectedSlashCommandIndex,
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
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          sx={{
            p: 1.5,
            minHeight,
            outline: isDragOver ? "2px solid" : "none",
            outlineColor: isDragOver ? "primary.main" : undefined,
            outlineOffset: isDragOver ? -2 : undefined,
            borderRadius: 1,
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
