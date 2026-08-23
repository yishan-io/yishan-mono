import { Alert, Autocomplete, Box, Button, Checkbox, Popover, TextField } from "@mui/material";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getLocalTaskTagsValidationError, normalizeLocalTaskTag } from "../../localTaskTags";
import type { LocalTaskTagCatalogEntry, LocalTaskTagColor, LocalTaskTagCustomColor } from "../../localTaskTypes";
import { LocalTaskTagChip } from "./LocalTaskTagChip";
import {
  getLocalTaskTagCatalogEntry,
  getLocalTaskTagColorValue,
  isLocalTaskTagSelected,
  toggleLocalTaskTagSelection,
} from "./localTaskTagColorPresets";

type LocalTaskTagsInputProps = {
  tags: string[];
  suggestions: string[];
  tagCatalog?: LocalTaskTagCatalogEntry[];
  onChange: (tags: string[]) => void;
  onTagColorChange?: (
    tag: string,
    color: LocalTaskTagColor | null,
    customColor?: LocalTaskTagCustomColor | null,
  ) => Promise<unknown>;
  onDraftValidityChange?: (isValid: boolean) => void;
  disabled?: boolean;
  label?: string;
  autoFocus?: boolean;
  isSelectorOpen?: boolean;
  onEscape?: () => void;
  selectorRevision?: number;
};
const TAG_COLORS = ["amber", "blue", "green", "purple", "red", "teal"] as const;

/** Renders a Linear-like Local Task tag selector without transport or store dependencies. */
export function LocalTaskTagsInput({
  tags,
  suggestions,
  tagCatalog = [],
  onChange,
  onTagColorChange,
  onDraftValidityChange,
  disabled = false,
  label,
  autoFocus = false,
  isSelectorOpen,
  onEscape,
  selectorRevision,
}: LocalTaskTagsInputProps) {
  const { t } = useTranslation();
  const [draftTags, setDraftTags] = useState(tags);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [colorTagName, setColorTagName] = useState<string | null>(null);
  const [colorUpdateError, setColorUpdateError] = useState<string | null>(null);
  const [isColorUpdating, setIsColorUpdating] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tagsKey = JSON.stringify(tags);
  const previousTagsKeyRef = useRef(tagsKey);
  const previousSelectorRevisionRef = useRef(selectorRevision);
  const validationError = useMemo(() => getLocalTaskTagsValidationError(draftTags), [draftTags]);
  const colorTag = useMemo(
    () => (colorTagName ? (getLocalTaskTagCatalogEntry(colorTagName, tagCatalog) ?? null) : null),
    [colorTagName, tagCatalog],
  );

  useEffect(() => {
    if (previousTagsKeyRef.current !== tagsKey || previousSelectorRevisionRef.current !== selectorRevision) {
      const didResetSelector = previousSelectorRevisionRef.current !== selectorRevision;
      previousTagsKeyRef.current = tagsKey;
      previousSelectorRevisionRef.current = selectorRevision;
      setDraftTags(tags);
      if (didResetSelector) {
        setColorAnchor(null);
        setColorTagName(null);
        setColorUpdateError(null);
      }
    }
  }, [selectorRevision, tags, tagsKey]);
  useEffect(() => {
    onDraftValidityChange?.(!validationError);
  }, [onDraftValidityChange, validationError]);

  const openNewTagColorPicker = useCallback(
    (tag: string) => {
      if (!onTagColorChange || disabled) return;
      setColorUpdateError(null);
      setColorTagName(tag);
      setColorAnchor(inputRef.current);
    },
    [disabled, onTagColorChange],
  );

  const commitTags = useCallback(
    (nextTags: string[]) => {
      const normalizedTags = nextTags.map(normalizeLocalTaskTag);
      setDraftTags(normalizedTags);
      if (!getLocalTaskTagsValidationError(normalizedTags)) onChange(normalizedTags);
      return normalizedTags;
    },
    [onChange],
  );

  const handleChange = useCallback(
    (_event: React.SyntheticEvent, nextTags: string[], reason: string, details?: { option: string }) => {
      const selectedTags =
        reason === "selectOption" && details?.option
          ? toggleLocalTaskTagSelection(details.option, draftTags, tagCatalog)
          : nextTags;
      const normalizedTags = commitTags(selectedTags);
      if (reason === "createOption" && details?.option && !getLocalTaskTagsValidationError(normalizedTags)) {
        const newTag = normalizeLocalTaskTag(details.option);
        if (!getLocalTaskTagCatalogEntry(newTag, tagCatalog)) openNewTagColorPicker(newTag);
      }
    },
    [commitTags, draftTags, openNewTagColorPicker, tagCatalog],
  );
  const handleActiveOptionSpace = useCallback(
    (activeOptionId: string) => {
      const activeOption = document.getElementById(activeOptionId);
      const option = activeOption?.getAttribute("data-local-task-tag-option");
      if (option) commitTags(toggleLocalTaskTagSelection(option, draftTags, tagCatalog));
    },
    [commitTags, draftTags, tagCatalog],
  );
  const isOptionEqualToValue = useCallback(
    (option: string, selectedTag: string) => {
      const optionEntry = getLocalTaskTagCatalogEntry(option, tagCatalog);
      const selectedEntry = getLocalTaskTagCatalogEntry(selectedTag, tagCatalog);
      return optionEntry && selectedEntry ? optionEntry.key === selectedEntry.key : option === selectedTag;
    },
    [tagCatalog],
  );
  const handleColorChange = useCallback(
    async (color: LocalTaskTagColor | null, customColor: LocalTaskTagCustomColor | null = null) => {
      if (!colorTagName || !onTagColorChange || isColorUpdating) return;
      setIsColorUpdating(true);
      setColorUpdateError(null);
      try {
        await onTagColorChange(colorTagName, color, customColor);
        setColorAnchor(null);
        setColorTagName(null);
      } catch (error) {
        setColorUpdateError(getErrorMessage(error));
      } finally {
        setIsColorUpdating(false);
      }
    },
    [colorTagName, isColorUpdating, onTagColorChange],
  );
  const renderOption = useCallback(
    (optionProps: React.HTMLAttributes<HTMLLIElement>, option: string) => {
      const entry = getLocalTaskTagCatalogEntry(option, tagCatalog);
      const { key: optionKey, ...listItemProps } = optionProps as React.HTMLAttributes<HTMLLIElement> & {
        key?: React.Key;
      };
      return (
        <li key={optionKey ?? option} data-local-task-tag-option={option} {...listItemProps}>
          <Checkbox
            checked={isLocalTaskTagSelected(option, draftTags, tagCatalog)}
            slotProps={{ input: { "aria-hidden": true, tabIndex: -1 } }}
            sx={{ pointerEvents: "none" }}
          />
          <Box
            component="span"
            data-local-task-tag-dot
            aria-hidden="true"
            sx={(theme) => ({
              bgcolor:
                entry?.customColor ??
                (entry?.color ? getLocalTaskTagColorValue(entry.color, theme) : theme.palette.text.disabled),
              borderRadius: "50%",
              height: 8,
              width: 8,
            })}
          />
          <Box component="span" sx={{ ml: 1 }}>
            {option}
          </Box>
        </li>
      );
    },
    [draftTags, tagCatalog],
  );

  return (
    <>
      <Autocomplete<string, true, false, true>
        multiple
        freeSolo
        size="small"
        disabled={disabled}
        disablePortal
        open={isSelectorOpen}
        options={suggestions}
        value={draftTags}
        isOptionEqualToValue={isOptionEqualToValue}
        onChange={handleChange}
        renderOption={renderOption}
        renderValue={(selectedTags, getTagProps) =>
          selectedTags.map((tag, index) => {
            const tagProps = getTagProps({ index }) as ReturnType<typeof getTagProps> & { key?: React.Key };
            const { key: chipKey, ...chipProps } = tagProps;
            return (
              <LocalTaskTagChip
                key={chipKey ?? tag}
                tag={tag}
                tagCatalog={tagCatalog}
                onDelete={chipProps.onDelete}
                chipProps={chipProps}
              />
            );
          })
        }
        slotProps={{
          listbox: { component: VirtualizedListbox },
          paper: { elevation: 0, sx: { boxShadow: "none", m: 0 } },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus={autoFocus}
            inputRef={inputRef}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onEscape?.();
                return;
              }
              if (!(event.target instanceof HTMLInputElement)) return;
              const activeOptionId = event.target.getAttribute("aria-activedescendant");
              if (event.key !== " " || !activeOptionId) return;
              event.preventDefault();
              event.stopPropagation();
              handleActiveOptionSpace(activeOptionId);
            }}
            label={label ?? t("localTask.fields.tags")}
            error={Boolean(validationError)}
            helperText={validationError}
          />
        )}
      />
      <Popover
        anchorEl={colorAnchor}
        open={Boolean(colorAnchor)}
        onClose={() => {
          if (!isColorUpdating) {
            setColorAnchor(null);
            setColorTagName(null);
          }
        }}
      >
        <Box
          component="fieldset"
          aria-label={t("localTask.tags.colorPicker", { tag: colorTagName })}
          sx={{ border: 0, m: 0, p: 1 }}
        >
          {colorUpdateError ? <Alert severity="error">{colorUpdateError}</Alert> : null}
          <Box aria-label={t("localTask.tags.presetColors")} sx={{ display: "flex", gap: 0.75, my: 0.5 }}>
            {TAG_COLORS.map((color) => (
              <Box
                key={color}
                component="button"
                type="button"
                aria-label={t(`localTask.tags.color.${color}`)}
                aria-pressed={colorTag?.color === color}
                disabled={disabled || isColorUpdating}
                onClick={() => void handleColorChange(color)}
                sx={(theme) => ({
                  backgroundColor: getLocalTaskTagColorValue(color, theme),
                  border: 0,
                  borderRadius: "50%",
                  cursor: "pointer",
                  height: 20,
                  width: 20,
                })}
              />
            ))}
          </Box>
          <Button size="small" disabled={disabled || isColorUpdating} onClick={() => colorInputRef.current?.click()}>
            {t("localTask.tags.customizeColor")}
          </Button>
          <Button size="small" disabled={disabled || isColorUpdating} onClick={() => void handleColorChange(null)}>
            {t("localTask.tags.clearColor")}
          </Button>
          <input
            ref={colorInputRef}
            aria-label={t("localTask.tags.customColorInput")}
            type="color"
            hidden
            onChange={(event) => void handleColorChange(null, event.target.value as LocalTaskTagCustomColor)}
          />
        </Box>
      </Popover>
    </>
  );
}
