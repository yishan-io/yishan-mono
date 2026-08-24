import { Box, IconButton, Popover, Tooltip } from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuPlus } from "react-icons/lu";
import { updateLocalTaskTagColor } from "../../commands/localTaskCommands";
import type { LocalTaskTagCatalogEntry, LocalTaskTagRef } from "../../localTaskTypes";
import { LocalTaskTagChip } from "../../ui/LocalTaskTagChip";
import { LocalTaskTagSelector } from "./LocalTaskTagSelector";

type LocalTaskTagsInlineEditorProps = {
  tagRefs?: LocalTaskTagRef[];
  /** @deprecated Compatibility input for pre-ID task records. */
  tags?: string[];
  tagCatalog?: LocalTaskTagCatalogEntry[];
  onTagIdsChange?: (tagIds: string[]) => Promise<unknown>;
  onCreateTag?: (name: string) => Promise<LocalTaskTagCatalogEntry>;
  isMutationLoading?: boolean;
};

/**
 * Renders task tags as a row of chips with an add button.
 * Clicking any chip or the add button opens the tag selector popover.
 */
export function LocalTaskTagsInlineEditor({
  tagRefs,
  tags,
  tagCatalog = [],
  onTagIdsChange,
  onCreateTag,
  isMutationLoading = false,
}: LocalTaskTagsInlineEditorProps) {
  const { t } = useTranslation();
  const [anchorPosition, setAnchorPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectorRevision, setSelectorRevision] = useState(0);
  const isOpen = anchorPosition !== null;
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Resolve the display tags from tagRefs (ID-based) or legacy names.
  const displayTagRefs: LocalTaskTagRef[] = useMemo(() => {
    if (tagRefs && tagRefs.length > 0) return tagRefs;
    return (tags ?? []).map((name) => {
      const entry = tagCatalog.find((e) => e.aliases.includes(name));
      return entry ? { id: entry.id, name: entry.name } : { id: name, name };
    });
  }, [tagRefs, tags, tagCatalog]);

  // Convert tagRefs to tag names for LocalTaskTagSelector (which works with names).
  const selectedTagNames = useMemo(
    () =>
      displayTagRefs.map((ref) => {
        const entry = tagCatalog.find((e) => e.id === ref.id);
        return entry?.name ?? ref.name ?? ref.id;
      }),
    [displayTagRefs, tagCatalog],
  );

  const suggestions = useMemo(() => tagCatalog.map((e) => e.name), [tagCatalog]);

  const handleOpen = useCallback(
    (event: React.MouseEvent) => {
      if (isMutationLoading) return;
      setAnchorPosition({ top: event.clientY, left: event.clientX });
      setSelectorRevision((r) => r + 1);
    },
    [isMutationLoading],
  );

  const handleClose = useCallback(() => setAnchorPosition(null), []);

  // Convert names → IDs, creating new tags as needed, then call onTagIdsChange.
  const handleSelectorChange = useCallback(
    (nextNames: string[]) => {
      void (async () => {
        try {
          const nextIds = await Promise.all(
            nextNames.map(async (name) => {
              const entry = tagCatalog.find((e) => e.name === name || e.aliases.includes(name));
              if (entry) return entry.id;
              if (onCreateTag) {
                const created = await onCreateTag(name);
                return created.id;
              }
              return name;
            }),
          );
          await onTagIdsChange?.(nextIds);
        } catch (error) {
          console.error("[LocalTaskTagsInlineEditor] tag update failed", getErrorMessage(error));
        }
      })();
    },
    [tagCatalog, onCreateTag, onTagIdsChange],
  );

  // Bridge for LocalTaskTagColorPicker: first arg is a catalog ID (resolved inside the picker).
  const handleTagColorChange = useCallback(async (tagId: string, color: string | null) => {
    await updateLocalTaskTagColor(tagId, color);
  }, []);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", minWidth: 0 }}>
      {displayTagRefs.map((ref) => (
        <LocalTaskTagChip
          key={ref.id}
          tag={ref}
          tagCatalog={tagCatalog}
          chipProps={{
            onClick: handleOpen,
            clickable: !isMutationLoading,
            disabled: isMutationLoading,
          }}
        />
      ))}
      <Tooltip title={t("localTask.tags.add")}>
        <Box component="span">
          <IconButton
            ref={addButtonRef}
            size="small"
            disabled={isMutationLoading}
            aria-label={t("localTask.tags.add")}
            onClick={handleOpen}
            sx={{ width: 22, height: 22 }}
          >
            <LuPlus size={13} />
          </IconButton>
        </Box>
      </Tooltip>

      <Popover
        open={isOpen}
        anchorReference="anchorPosition"
        anchorPosition={anchorPosition ?? { top: 0, left: 0 }}
        transformOrigin={{ horizontal: "left", vertical: "top" }}
        onClose={handleClose}
        slotProps={{ paper: { sx: { width: 240, height: 300, display: "flex", flexDirection: "column", p: 1 } } }}
      >
        <LocalTaskTagSelector
          tags={selectedTagNames}
          suggestions={suggestions}
          tagCatalog={tagCatalog}
          onChange={handleSelectorChange}
          onTagColorChange={handleTagColorChange}
          disabled={isMutationLoading}
          label={t("localTask.fields.tags")}
          autoFocus
          selectorRevision={selectorRevision}
          onEscape={handleClose}
        />
      </Popover>
    </Box>
  );
}
