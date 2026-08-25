import { Alert, Autocomplete, Box, Checkbox, TextField } from "@mui/material";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { LocalTaskTagChip } from "../../ui/LocalTaskTagChip";

type LocalTaskTagsInputProps = {
  tagIds?: string[];
  /** @deprecated Named compatibility input for task records created before catalog IDs. */
  tags?: string[];
  tagCatalog?: LocalTaskTagCatalogEntry[];
  onChange: (tagIds: string[]) => void;
  onCreateTag?: (name: string) => Promise<LocalTaskTagCatalogEntry>;
  disabled?: boolean;
  disablePortal?: boolean;
  label?: string;
  autoFocus?: boolean;
  isSelectorOpen?: boolean;
  onEscape?: () => void;
};

type SelectedTag = LocalTaskTagCatalogEntry | string;

function resolveLegacyTag(name: string, tagCatalog: LocalTaskTagCatalogEntry[]): LocalTaskTagCatalogEntry | undefined {
  return tagCatalog.find((entry) => entry.aliases.includes(name));
}

function getSelectedTags(
  tagIds: string[] | undefined,
  tags: string[] | undefined,
  tagCatalog: LocalTaskTagCatalogEntry[],
) {
  if (tagIds !== undefined) {
    return tagIds.map((id) => tagCatalog.find((entry) => entry.id === id) ?? id);
  }
  return (tags ?? []).map((name) => resolveLegacyTag(name, tagCatalog) ?? name);
}

/** Selects stable catalog IDs; legacy names are resolved only through daemon-provided aliases. */
export function LocalTaskTagsInput({
  tagIds,
  tags,
  tagCatalog = [],
  onChange,
  onCreateTag,
  disabled = false,
  disablePortal = true,
  label,
  autoFocus = false,
  isSelectorOpen,
  onEscape,
}: LocalTaskTagsInputProps) {
  const { t } = useTranslation();
  const [creationError, setCreationError] = useState<string | null>(null);
  const selectedTags = useMemo(() => getSelectedTags(tagIds, tags, tagCatalog), [tagIds, tags, tagCatalog]);
  const hasUnresolvedLegacyTag =
    tags !== undefined && tagIds === undefined && selectedTags.some((tag) => typeof tag === "string");
  const isDisabled = disabled || hasUnresolvedLegacyTag;
  const handleChange = useCallback(
    async (_event: React.SyntheticEvent, nextTags: SelectedTag[]) => {
      setCreationError(null);
      try {
        const resolvedTags = await Promise.all(
          nextTags.map(async (tag) => {
            if (typeof tag !== "string") return tag;
            if (!onCreateTag) throw new Error(t("localTask.tags.creationUnavailable"));
            return onCreateTag(tag);
          }),
        );
        onChange([...new Set(resolvedTags.map((tag) => tag.id))]);
      } catch (error) {
        setCreationError(getErrorMessage(error));
      }
    },
    [onChange, onCreateTag, t],
  );
  const renderOption = useCallback(
    (optionProps: React.HTMLAttributes<HTMLLIElement>, option: LocalTaskTagCatalogEntry) => {
      const { key, ...listItemProps } = optionProps as React.HTMLAttributes<HTMLLIElement> & { key?: React.Key };
      return (
        <li key={key ?? option.id} {...listItemProps}>
          <Checkbox
            checked={selectedTags.some((tag) => typeof tag !== "string" && tag.id === option.id)}
            slotProps={{ input: { "aria-hidden": true, tabIndex: -1 } }}
          />
          <Box
            component="span"
            aria-hidden="true"
            data-local-task-tag-dot
            sx={(theme) => ({
              bgcolor: option.color ?? theme.palette.text.disabled,
              borderRadius: "50%",
              height: 8,
              width: 8,
            })}
          />
          <Box component="span" sx={{ ml: 1 }}>
            {option.name}
          </Box>
        </li>
      );
    },
    [selectedTags],
  );
  const inputLabel = label ?? t("localTask.fields.tags");
  return (
    <Box>
      {hasUnresolvedLegacyTag ? <Alert severity="warning">{t("localTask.tags.unresolvedLegacy")}</Alert> : null}
      {creationError ? <Alert severity="error">{creationError}</Alert> : null}
      <Autocomplete<LocalTaskTagCatalogEntry, true, false, true>
        multiple
        freeSolo
        size="small"
        disabled={isDisabled}
        disablePortal={disablePortal}
        open={isSelectorOpen}
        options={tagCatalog}
        value={selectedTags}
        getOptionLabel={(tag) => (typeof tag === "string" ? tag : tag.name)}
        isOptionEqualToValue={(option, value) => typeof value !== "string" && option.id === value.id}
        onChange={(event, nextTags) => void handleChange(event, nextTags)}
        renderOption={renderOption}
        renderValue={(renderedTags, getTagProps) =>
          renderedTags.map((tag, index) => {
            const tagProps = getTagProps({ index }) as ReturnType<typeof getTagProps> & { key?: React.Key };
            const { key, onDelete: _onDelete, ...chipProps } = tagProps;
            const tagRef = typeof tag === "string" ? { id: "", name: tag } : { id: tag.id, name: tag.name };
            return (
              <LocalTaskTagChip key={key ?? tagRef.name} tag={tagRef} tagCatalog={tagCatalog} chipProps={chipProps} />
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
            placeholder={inputLabel}
            slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps?.htmlInput, "aria-label": inputLabel } }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onEscape?.();
            }}
          />
        )}
      />
    </Box>
  );
}
