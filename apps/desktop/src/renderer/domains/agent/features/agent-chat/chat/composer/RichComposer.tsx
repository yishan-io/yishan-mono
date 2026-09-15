import { Box, Typography } from "@mui/material";
import type { FileTreeDragEntry } from "@renderer/domains/files";
import type { ClipboardEvent, SyntheticEvent } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { RichComposerFileMentionMenu } from "./RichComposerFileMentionMenu";
import { RichComposerSlashCommandMenu } from "./RichComposerSlashCommandMenu";
import { focusComposer, getComposerCaretOffset, getComposerText, insertComposerPlainText } from "./composerDom";
import type { FileMentionResult, RichComposerSlashCommand } from "./richComposerTypes";
import { useComposerFileDrop } from "./useComposerFileDrop";
import { useComposerFileMentionMenu } from "./useComposerFileMentionMenu";
import { useComposerKeyDown } from "./useComposerKeyDown";
import { useComposerSlashCommandMenu } from "./useComposerSlashCommandMenu";
import { useComposerSynchronization } from "./useComposerSynchronization";

export type { RichComposerSlashCommand } from "./richComposerTypes";
export type { FileTreeDragEntry as DroppedFileEntry } from "@renderer/domains/files";

/** Imperative controls exposed by a rich composer. */
export type RichComposerHandle = {
  /** Focuses the composer text input. */
  focus: () => void;
};

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
export const RichComposer = forwardRef<RichComposerHandle, RichComposerProps>(function RichComposer(
  {
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
  },
  ref,
) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const shouldMoveCaretToEndAfterFileDropRef = useRef(false);
  const syncSuggestionMenusRef = useRef<(editable: HTMLDivElement, value: string, caretOffset: number) => void>(
    () => {},
  );
  const closeSuggestionMenusRef = useRef<() => void>(() => {});
  const [isComposerFocused, setIsComposerFocused] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (composerRef.current) {
          focusComposer(composerRef.current);
        }
      },
    }),
    [],
  );

  const { handleComposerCompositionStart, handleComposerCompositionEnd, handleComposerInput, isComposingRef } =
    useComposerSynchronization({
      composerRef,
      disabled,
      value,
      onChange,
      slashCommands,
      shouldMoveCaretToEndAfterFileDropRef,
      syncSuggestionMenusRef,
      closeSuggestionMenusRef,
    });

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
    mentionResults,
    isSearching,
    hasSearchError,
    syncMentionMenu,
    insertMentionFile,
    handleMentionComposerKeyDown,
  } = useComposerFileMentionMenu({
    disabled,
    composerRef,
    onChange,
    slashCommands,
    fileMentionSearch,
    onMentionFile,
    isComposingRef,
  });

  syncSuggestionMenusRef.current = (editable, nextValue, caretOffset) => {
    syncSlashCommandMenu(editable, nextValue, caretOffset);
    syncMentionMenu(editable, nextValue, caretOffset);
  };
  closeSuggestionMenusRef.current = () => {
    setActiveSlashCommandRange(null);
    setActiveMentionRange(null);
  };

  const handleComposerKeyDown = useComposerKeyDown({
    disabled,
    value,
    onChange,
    onSubmit,
    allowEmptySubmit,
    isComposingRef,
    activeSlashCommandRange,
    setActiveSlashCommandRange,
    selectedSlashCommandIndex,
    setSelectedSlashCommandIndex,
    filteredSlashCommands,
    insertSlashCommand,
    handleMentionComposerKeyDown,
  });

  const handleComposerSelectionChange = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      // Escape never changes a selection; without this guard the keyup after an Escape
      // keydown reopens the just-dismissed suggestion menu (caret is still in the token).
      if ((event.nativeEvent as KeyboardEventInit).key === "Escape") {
        return;
      }
      if (isComposingRef.current) {
        return;
      }
      const editable = event.currentTarget;
      const nextValue = getComposerText(editable);
      syncSlashCommandMenu(editable, nextValue, getComposerCaretOffset(editable));
      syncMentionMenu(editable, nextValue, getComposerCaretOffset(editable));
    },
    [isComposingRef, syncMentionMenu, syncSlashCommandMenu],
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
      insertComposerPlainText(plainText);
    },
    [disabled, onPasteBlock],
  );

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
          onCompositionStart={handleComposerCompositionStart}
          onCompositionEnd={handleComposerCompositionEnd}
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
});
