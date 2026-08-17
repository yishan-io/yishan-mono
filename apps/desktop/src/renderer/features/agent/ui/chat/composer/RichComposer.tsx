import { Box, Typography } from "@mui/material";
import type { FileTreeDragEntry } from "@renderer/features/files";
import type { ClipboardEvent, SyntheticEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RichComposerFileMentionMenu } from "./RichComposerFileMentionMenu";
import { RichComposerSlashCommandMenu } from "./RichComposerSlashCommandMenu";
import { getCaretOffset, normalizeComposerText, renderComposerHtml, setCaretOffset } from "./richComposerHelpers";
import type { FileMentionResult, RichComposerSlashCommand } from "./richComposerTypes";
import { useComposerFileDrop } from "./useComposerFileDrop";
import { useComposerFileMentionMenu } from "./useComposerFileMentionMenu";
import { useComposerKeyDown } from "./useComposerKeyDown";
import { useComposerSlashCommandMenu } from "./useComposerSlashCommandMenu";

export type { RichComposerSlashCommand } from "./richComposerTypes";
export type { FileTreeDragEntry as DroppedFileEntry } from "@renderer/features/files";

type RichComposerProps = {
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => unknown;
  minHeight?: number;
  disabled?: boolean;
  slashCommands?: RichComposerSlashCommand[];
  focusShortcutHint?: string;
  /** Allow Enter to submit even when the composer text is empty (e.g. when attachments are present). */
  allowEmptySubmit?: boolean;
  onFilesDrop?: (entries: FileTreeDragEntry[]) => void;
  onPasteBlock?: (text: string) => void;
  /** Async file search backing the @ mention menu. When omitted, the mention menu is disabled. */
  fileMentionSearch?: (query: string) => Promise<FileMentionResult[]>;
  /** Called with the selected file path when a mention is inserted. */
  onMentionFile?: (path: string, isDirectory: boolean) => void;
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
  fileMentionSearch,
  onMentionFile,
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

  const {
    activeMentionRange,
    setActiveMentionRange,
    selectedMentionIndex,
    setSelectedMentionIndex,
    mentionResults,
    isSearching,
    hasSearchError,
    syncMentionMenu,
    insertMentionFile,
    handleMentionComposerKeyDown,
  } = useComposerFileMentionMenu({ disabled, composerRef, onChange, slashCommands, fileMentionSearch, onMentionFile });

  const handleComposerKeyDown = useComposerKeyDown({
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
  });

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
      syncMentionMenu(editable, nextValue, caretOffset);
    },
    [disabled, onChange, slashCommands, syncMentionMenu, syncSlashCommandMenu],
  );

  const handleComposerSelectionChange = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      // Escape never changes a selection; without this guard the keyup after an Escape
      // keydown reopens the just-dismissed suggestion menu (caret is still in the token).
      if ((event.nativeEvent as KeyboardEventInit).key === "Escape") {
        return;
      }
      const editable = event.currentTarget;
      const nextValue = normalizeComposerText(editable.innerText);
      syncSlashCommandMenu(editable, nextValue, getCaretOffset(editable));
      syncMentionMenu(editable, nextValue, getCaretOffset(editable));
    },
    [syncMentionMenu, syncSlashCommandMenu],
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
      <RichComposerFileMentionMenu
        anchorEl={composerRef.current}
        open={activeMentionRange !== null}
        results={mentionResults}
        isSearching={isSearching}
        hasSearchError={hasSearchError}
        selectedResultIndex={selectedMentionIndex}
        onClose={() => {
          setActiveMentionRange(null);
        }}
        onSelect={insertMentionFile}
      />
    </>
  );
}
