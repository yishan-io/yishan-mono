import { Alert, Box, IconButton, Popover, Tooltip } from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuPlus } from "react-icons/lu";
import type { LocalTaskTagCatalogEntry, LocalTaskTagColor, LocalTaskTagCustomColor } from "../../localTaskTypes";
import { LocalTaskTagChip } from "./LocalTaskTagChip";
import { LocalTaskTagSelector } from "./LocalTaskTagSelector";

const SELECTOR_POPOVER_HEIGHT = 320;
const SELECTOR_POPOVER_WIDTH = 280;

type LocalTaskTagsEditorProps = {
  tags: string[];
  suggestions: string[];
  tagCatalog?: LocalTaskTagCatalogEntry[];
  onTagsChange: (tags: string[]) => Promise<unknown>;
  onTagColorChange?: (
    key: string,
    color: LocalTaskTagColor | null,
    customColor?: LocalTaskTagCustomColor | null,
  ) => Promise<unknown>;
  isMutationLoading?: boolean;
};

/** Edits Local Task tags through direct deletion and an anchored tag selector. */
export function LocalTaskTagsEditor({
  tags,
  suggestions,
  tagCatalog = [],
  onTagsChange,
  onTagColorChange,
  isMutationLoading,
}: LocalTaskTagsEditorProps) {
  const { t } = useTranslation();
  const [selectorAnchor, setSelectorAnchor] = useState<HTMLElement | null>(null);
  const [selectorAnchorTag, setSelectorAnchorTag] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>(tags);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [selectorRevision, setSelectorRevision] = useState(0);
  const isSelectorOpen = Boolean(selectorAnchor);
  const isDisabled = isMutationLoading || isSubmitting;

  useEffect(() => {
    const isTagAnchorRemoved = selectorAnchorTag !== null && !tags.includes(selectorAnchorTag);
    if (!selectorAnchor || (!isTagAnchorRemoved && selectorAnchor.isConnected)) return;
    const addButton = addButtonRef.current;
    if (!addButton?.isConnected) {
      setSelectorAnchor(null);
      setSelectorAnchorTag(null);
      return;
    }
    setSelectorAnchor(addButton);
    setSelectorAnchorTag(null);
  }, [selectorAnchor, selectorAnchorTag, tags]);

  useEffect(() => {
    const addButton = addButtonRef.current;
    if (isDisabled || !addButton || selectorAnchor !== addButton) return;
    addButton.focus();
  }, [isDisabled, selectorAnchor]);

  const handleOpenSelector = useCallback(
    (event: React.MouseEvent<HTMLElement>, tag?: string) => {
      if (isDisabled) return;
      setSelectedTags(tags);
      setMutationError(null);
      setSelectorAnchor(event.currentTarget);
      setSelectorAnchorTag(tag ?? null);
    },
    [isDisabled, tags],
  );
  const handleCloseSelector = useCallback(() => {
    setSelectorAnchor(null);
    setSelectorAnchorTag(null);
    setMutationError(null);
  }, []);
  const handleSelectionChange = useCallback(
    async (nextTags: string[]) => {
      if (isDisabled) return;
      const previousTags = selectedTags;
      setSelectedTags(nextTags);
      setIsSubmitting(true);
      setMutationError(null);
      try {
        await onTagsChange(nextTags);
      } catch (error) {
        setSelectedTags(previousTags);
        setSelectorRevision((revision) => revision + 1);
        setMutationError(getErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    },
    [isDisabled, onTagsChange, selectedTags],
  );

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
        {tags.map((tag) => (
          <LocalTaskTagChip
            key={tag}
            tag={tag}
            tagCatalog={tagCatalog}
            disabled={isDisabled}
            chipProps={{ onClick: (event) => handleOpenSelector(event, tag) }}
          />
        ))}
        <Tooltip title={t("localTask.tags.add")}>
          <Box component="span">
            <IconButton
              ref={addButtonRef}
              size="small"
              disabled={isDisabled}
              aria-label={t("localTask.tags.add")}
              onClick={handleOpenSelector}
            >
              <LuPlus size={16} />
            </IconButton>
          </Box>
        </Tooltip>
      </Box>
      {mutationError && !isSelectorOpen ? <Alert severity="error">{mutationError}</Alert> : null}
      <Popover
        anchorEl={selectorAnchor}
        disableEnforceFocus
        open={isSelectorOpen}
        onClose={handleCloseSelector}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              display: "flex",
              flexDirection: "column",
              height: SELECTOR_POPOVER_HEIGHT,
              mt: 0.5,
              overflow: "hidden",
              p: 1,
              width: SELECTOR_POPOVER_WIDTH,
            },
          },
        }}
      >
        <LocalTaskTagSelector
          tags={selectedTags}
          suggestions={suggestions}
          tagCatalog={tagCatalog}
          onChange={(nextTags) => void handleSelectionChange(nextTags)}
          onTagColorChange={onTagColorChange}
          disabled={isDisabled}
          label={t("localTask.tags.addInput")}
          autoFocus
          onEscape={handleCloseSelector}
          selectorRevision={selectorRevision}
        />
        {mutationError ? (
          <Alert severity="error" sx={{ flexShrink: 0, mt: 1 }}>
            {mutationError}
          </Alert>
        ) : null}
      </Popover>
    </>
  );
}
