import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { ConfirmationDialog } from "@renderer/ui/components/ConfirmationDialog";
import { SettingsCard, SettingsSectionHeader } from "@renderer/ui/components/SettingsPrimitives";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  deleteLocalTaskTag,
  loadLocalTaskTagSuggestions,
  renameLocalTaskTag,
  updateLocalTaskTagColor,
} from "../../commands/localTaskCommands";
import type { LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";
import { LocalTaskTagSettingsRow } from "../../ui/LocalTaskTagSettingsRow";
import { LocalTaskTagColorPicker } from "./LocalTaskTagColorPicker";
const TAG_ROW_HEIGHT = 40;
const TAG_LIST_MAX_HEIGHT = 480;
const TAG_LIST_PAGE_SIZE = 10;
function getFilteredTagCatalog(
  tagCatalog: LocalTaskTagCatalogEntry[],
  searchQuery: string,
): LocalTaskTagCatalogEntry[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  if (!normalizedQuery) return tagCatalog;
  return tagCatalog.filter(
    (entry) =>
      entry.name.toLocaleLowerCase().includes(normalizedQuery) ||
      entry.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedQuery)),
  );
}
/** Renders searchable, virtualized Local Task tag management rows. */
export function LocalTaskTagsSettingsView() {
  const { t } = useTranslation();
  const tagCatalog = localTaskStore((state) => state.tagCatalog);
  const tagCatalogLoadState = localTaskStore((state) => state.tagSuggestionsLoadState);
  const tagCatalogError = localTaskStore((state) => state.tagSuggestionsError);
  const isMutationLoading = localTaskStore((state) => state.isMutationLoading);
  const scrollRef = useRef<HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [colorAnchorPosition, setColorAnchorPosition] = useState<{ left: number; top: number } | null>(null);
  const [colorTag, setColorTag] = useState<LocalTaskTagCatalogEntry | null>(null);
  const [focusedTagIndex, setFocusedTagIndex] = useState(0);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [deletingTag, setDeletingTag] = useState<LocalTaskTagCatalogEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const filteredTagCatalog = useMemo(() => getFilteredTagCatalog(tagCatalog, searchQuery), [searchQuery, tagCatalog]);
  const virtualizer = useVirtualizer({
    count: filteredTagCatalog.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TAG_ROW_HEIGHT,
    overscan: 5,
  });
  const editingTagIndex = filteredTagCatalog.findIndex((tag) => tag.id === editingTagId);
  const virtualRows = virtualizer.getVirtualItems();
  const renderedIndexes = new Set(virtualRows.map((virtualRow) => virtualRow.index));
  if (focusedTagIndex >= 0 && focusedTagIndex < filteredTagCatalog.length) renderedIndexes.add(focusedTagIndex);
  if (editingTagIndex >= 0) renderedIndexes.add(editingTagIndex);
  const renderedVirtualRows = [...renderedIndexes]
    .sort((left, right) => left - right)
    .map(
      (index) =>
        virtualRows.find((virtualRow) => virtualRow.index === index) ?? {
          index,
          size: TAG_ROW_HEIGHT,
          start: index * TAG_ROW_HEIGHT,
        },
    );
  const isEditDisabled = isMutationLoading || isRenaming || isDeleting;
  const isMergeTarget = tagCatalog.some(
    (tag) => tag.id !== editingTagId && tag.name.toLocaleLowerCase() === editedName.trim().toLocaleLowerCase(),
  );

  useEffect(() => {
    // fire-and-forget: load state and errors are owned by the Local Task store.
    void loadLocalTaskTagSuggestions();
  }, []);

  useEffect(() => {
    if (focusedTagIndex >= filteredTagCatalog.length) setFocusedTagIndex(0);
  }, [filteredTagCatalog.length, focusedTagIndex]);

  const handleStartRename = useCallback((tag: LocalTaskTagCatalogEntry) => {
    setColorAnchorPosition(null);
    setColorTag(null);
    setMutationError(null);
    setEditingTagId(tag.id);
    setEditedName(tag.name);
  }, []);

  const handleCancelRename = useCallback(() => {
    if (isRenaming) return;
    setEditingTagId(null);
    setEditedName("");
    setMutationError(null);
  }, [isRenaming]);

  const handleRename = useCallback(async () => {
    if (!editingTagId || isRenaming) return;
    const name = editedName.trim();
    if (!name) {
      setMutationError(t("localTask.tags.settings.nameRequired"));
      return;
    }
    setIsRenaming(true);
    setMutationError(null);
    try {
      await renameLocalTaskTag(editingTagId, name);
      setEditingTagId(null);
      setEditedName("");
    } catch (error) {
      setMutationError(getErrorMessage(error));
    } finally {
      setIsRenaming(false);
    }
  }, [editedName, editingTagId, isRenaming, t]);

  const handleTagNavigationKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      const lastTagIndex = filteredTagCatalog.length - 1;
      const nextTagIndex =
        event.key === "ArrowDown"
          ? Math.min(focusedTagIndex + 1, lastTagIndex)
          : event.key === "ArrowUp"
            ? Math.max(focusedTagIndex - 1, 0)
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? lastTagIndex
                : event.key === "PageDown"
                  ? Math.min(focusedTagIndex + TAG_LIST_PAGE_SIZE, lastTagIndex)
                  : event.key === "PageUp"
                    ? Math.max(focusedTagIndex - TAG_LIST_PAGE_SIZE, 0)
                    : null;
      if (nextTagIndex !== null) {
        event.preventDefault();
        setFocusedTagIndex(nextTagIndex);
        virtualizer.scrollToIndex(nextTagIndex, { align: "auto" });
        return;
      }
      if (event.key === "Enter" && !isEditDisabled) {
        const tag = filteredTagCatalog[focusedTagIndex];
        if (!tag) return;
        event.preventDefault();
        handleStartRename(tag);
      }
    },
    [filteredTagCatalog, focusedTagIndex, handleStartRename, isEditDisabled, virtualizer],
  );

  const handleOpenColorPicker = useCallback(
    (anchor: HTMLElement, tag: LocalTaskTagCatalogEntry) => {
      if (isEditDisabled) return;
      const anchorRect = anchor.getBoundingClientRect();
      setColorAnchorPosition({ left: anchorRect.left, top: anchorRect.bottom });
      setColorTag(tag);
    },
    [isEditDisabled],
  );
  const handleCloseColorPicker = useCallback(() => {
    setColorAnchorPosition(null);
    setColorTag(null);
  }, []);
  const handleTagColorChange = useCallback(async (tagId: string, color: string | null) => {
    await updateLocalTaskTagColor(tagId, color);
  }, []);
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingTag || isDeleting) return;
    setIsDeleting(true);
    setMutationError(null);
    try {
      await deleteLocalTaskTag(deletingTag.id);
      setDeletingTag(null);
    } catch (error) {
      setMutationError(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  }, [deletingTag, isDeleting]);

  return (
    <>
      <SettingsSectionHeader
        title={t("localTask.tags.settings.title")}
        description={t("localTask.tags.settings.description")}
      />
      <SettingsCard>
        <TextField
          fullWidth
          slotProps={{ htmlInput: { "aria-label": t("localTask.tags.settings.search") } }}
          placeholder={t("localTask.tags.settings.search")}
          size="small"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        {mutationError ? (
          <Alert sx={{ mt: 2 }} severity="error">
            {mutationError}
          </Alert>
        ) : null}
        {tagCatalogLoadState === "loading" ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress aria-label={t("localTask.tags.settings.loading")} size={24} />
          </Box>
        ) : null}
        {tagCatalogLoadState === "error" ? (
          <Alert
            action={
              <Button color="inherit" size="small" onClick={() => void loadLocalTaskTagSuggestions()}>
                {t("localTask.actions.retry")}
              </Button>
            }
            severity="error"
            sx={{ mt: 2 }}
          >
            {tagCatalogError}
          </Alert>
        ) : null}
        {tagCatalogLoadState === "loaded" && filteredTagCatalog.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3 }}>
            {t("localTask.tags.settings.empty")}
          </Typography>
        ) : null}
        {tagCatalogLoadState === "loaded" && filteredTagCatalog.length > 0 ? (
          <Box
            component="section"
            ref={scrollRef}
            aria-label={t("localTask.tags.settings.list")}
            tabIndex={0}
            sx={{ maxHeight: TAG_LIST_MAX_HEIGHT, mt: 2, overflow: "auto", width: "100%" }}
            onKeyDown={handleTagNavigationKeyDown}
          >
            <Box
              component="ul"
              sx={{ height: virtualizer.getTotalSize(), listStyle: "none", m: 0, p: 0, position: "relative" }}
            >
              {renderedVirtualRows.map((virtualRow) => {
                const tag = filteredTagCatalog[virtualRow.index];
                if (!tag) return null;
                return (
                  <LocalTaskTagSettingsRow
                    key={tag.id}
                    editedName={editedName}
                    isEditDisabled={isEditDisabled}
                    isEditing={editingTagId === tag.id}
                    isMergeTarget={isMergeTarget}
                    measureElement={virtualizer.measureElement}
                    tag={tag}
                    virtualIndex={virtualRow.index}
                    virtualSize={virtualRow.size}
                    virtualStart={virtualRow.start}
                    onCancelRename={handleCancelRename}
                    onDelete={() => setDeletingTag(tag)}
                    onEditedNameChange={setEditedName}
                    onOpenColorPicker={(anchor) => handleOpenColorPicker(anchor, tag)}
                    onRename={() => void handleRename()}
                    onStartRename={() => handleStartRename(tag)}
                    t={t}
                  />
                );
              })}
            </Box>
          </Box>
        ) : null}
      </SettingsCard>
      <LocalTaskTagColorPicker
        anchorEl={null}
        anchorPosition={colorAnchorPosition}
        disabled={isEditDisabled}
        tagCatalog={tagCatalog}
        tagId={colorTag?.id}
        tagName={colorTag?.name ?? null}
        onClose={handleCloseColorPicker}
        onTagColorChange={handleTagColorChange}
      />
      <ConfirmationDialog
        open={Boolean(deletingTag)}
        title={t("localTask.tags.settings.deleteTitle")}
        description={t("localTask.tags.settings.deleteDescription", { tag: deletingTag?.name })}
        confirmColor="error"
        confirmLabel={t("localTask.tags.settings.confirmDelete")}
        isSubmitting={isDeleting}
        onCancel={() => !isDeleting && setDeletingTag(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}
