import { Box, Checkbox, TextField } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { getLocalTaskTagsValidationError, normalizeLocalTaskTag } from "../../localTaskTags";
import type { LocalTaskTagCatalogEntry, LocalTaskTagColor, LocalTaskTagCustomColor } from "../../localTaskTypes";
import { LocalTaskTagColorPicker } from "./LocalTaskTagColorPicker";
import {
  getLocalTaskTagCatalogEntry,
  getLocalTaskTagColorValue,
  isLocalTaskTagSelected,
  toggleLocalTaskTagSelection,
} from "../../ui/localTaskTagColorPresets";

const TAG_OPTION_HEIGHT = 36;
type LocalTaskTagSelectorProps = {
  tags: string[];
  suggestions: string[];
  tagCatalog: LocalTaskTagCatalogEntry[];
  onChange: (tags: string[]) => void;
  onTagColorChange?: (
    tag: string,
    color: LocalTaskTagColor | null,
    customColor?: LocalTaskTagCustomColor | null,
  ) => Promise<unknown>;
  disabled: boolean;
  label: string;
  autoFocus: boolean;
  onEscape?: () => void;
  selectorRevision?: number;
};

/** Renders the plain search and selection list used by the anchored tag selector. */
export function LocalTaskTagSelector({
  tags,
  suggestions,
  tagCatalog,
  onChange,
  onTagColorChange,
  disabled,
  label,
  autoFocus,
  onEscape,
  selectorRevision,
}: LocalTaskTagSelectorProps) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollListRef = useRef<HTMLDivElement>(null);
  const previousDisabledRef = useRef(disabled);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [colorTagName, setColorTagName] = useState<string | null>(null);
  const previousRevisionRef = useRef(selectorRevision);
  const normalizedQuery = normalizeLocalTaskTag(query);
  const candidateTags = useMemo(() => {
    const queryText = query.trim().toLocaleLowerCase();
    const availableTags = [...new Set([...suggestions, ...tags])];
    return availableTags.filter((tag) => tag.toLocaleLowerCase().includes(queryText));
  }, [query, suggestions, tags]);
  useEffect(() => {
    if (previousRevisionRef.current !== selectorRevision) {
      previousRevisionRef.current = selectorRevision;
      setQuery("");
      setActiveIndex(null);
      setColorAnchor(null);
      setColorTagName(null);
    }
  }, [selectorRevision]);
  useEffect(() => {
    setActiveIndex((previousIndex) => {
      if (candidateTags.length === 0) return null;
      if (previousIndex === null) return null;
      return previousIndex >= candidateTags.length ? candidateTags.length - 1 : previousIndex;
    });
  }, [candidateTags]);

  const virtualizer = useVirtualizer({
    count: candidateTags.length,
    getScrollElement: () => scrollListRef.current,
    estimateSize: () => TAG_OPTION_HEIGHT,
    overscan: 5,
  });

  useEffect(() => {
    if (activeIndex === null) return;
    virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, virtualizer]);

  useEffect(() => {
    if (previousDisabledRef.current && !disabled) inputRef.current?.focus();
    previousDisabledRef.current = disabled;
  }, [disabled]);

  const commitToggle = useCallback(
    (tag: string) => {
      if (disabled) return;
      onChange(toggleLocalTaskTagSelection(tag, tags, tagCatalog));
    },
    [disabled, onChange, tagCatalog, tags],
  );
  const openNewTagColorPicker = useCallback(
    (tag: string) => {
      if (!onTagColorChange || disabled) return;
      setColorTagName(tag);
      setColorAnchor(inputRef.current);
    },
    [disabled, onTagColorChange],
  );
  const createTag = useCallback(() => {
    if (disabled || !normalizedQuery || getLocalTaskTagCatalogEntry(normalizedQuery, tagCatalog)) return;
    const nextTags = [...tags, normalizedQuery];
    if (getLocalTaskTagsValidationError(nextTags)) return;
    onChange(nextTags);
    setQuery("");
    setActiveIndex(null);
    openNewTagColorPicker(normalizedQuery);
  }, [disabled, normalizedQuery, onChange, openNewTagColorPicker, tagCatalog, tags]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        onEscape?.();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (candidateTags.length === 0) return;
        setActiveIndex((previousIndex) => {
          const currentIndex = previousIndex ?? (event.key === "ArrowDown" ? -1 : 0);
          return event.key === "ArrowDown"
            ? (currentIndex + 1) % candidateTags.length
            : (currentIndex - 1 + candidateTags.length) % candidateTags.length;
        });
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      if (activeIndex !== null && candidateTags[activeIndex]) {
        event.preventDefault();
        commitToggle(candidateTags[activeIndex]);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        createTag();
      }
    },
    [activeIndex, candidateTags, commitToggle, createTag, onEscape],
  );
  return (
    <>
      <Box
        sx={{ display: "flex", flexBasis: 0, flexDirection: "column", flexGrow: 1, minHeight: 0, overflow: "hidden" }}
      >
        <TextField
          autoFocus={autoFocus}
          fullWidth
          id={inputId}
          inputRef={inputRef}
          placeholder={label}
          size="small"
          sx={{ flexShrink: 0 }}
          value={query}
          slotProps={{
            input: {
              sx: {
                minHeight: 28,
                "& .MuiInputBase-input": { py: 0.5, fontSize: 13 },
              },
            },
            htmlInput: {
              "aria-activedescendant": activeIndex === null ? undefined : `${listboxId}-option-${activeIndex}`,
              "aria-label": label,
              "aria-controls": listboxId,
              "aria-expanded": true,
              "aria-haspopup": "listbox",
            },
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(null);
          }}
          onKeyDown={handleKeyDown}
        />
        <Box
          ref={scrollListRef}
          data-local-task-tag-scroll-list="true"
          sx={{ flexBasis: 0, flexGrow: 1, minHeight: 0, mt: 1, overflowY: "auto" }}
        >
          <Box
            component="ul"
            aria-label={label}
            aria-multiselectable="true"
            id={listboxId}
            // biome-ignore lint/a11y/useSemanticElements: this is a multi-select ARIA listbox, not a native select.
            role="listbox"
            sx={{ height: virtualizer.getTotalSize(), listStyle: "none", m: 0, p: 0, position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const tag = candidateTags[virtualItem.index];
              if (!tag) return null;
              const entry = getLocalTaskTagCatalogEntry(tag, tagCatalog);
              const isSelected = isLocalTaskTagSelected(tag, tags, tagCatalog);
              return (
                <Box
                  key={tag}
                  aria-selected={isSelected}
                  component="li"
                  id={`${listboxId}-option-${virtualItem.index}`}
                  // biome-ignore lint/a11y/useSemanticElements: each list item is an ARIA option controlled by the search input.
                  role="option"
                  sx={(theme) => ({
                    "&:hover": disabled ? undefined : { bgcolor: theme.palette.action.hover },
                    alignItems: "center",
                    bgcolor: activeIndex === virtualItem.index ? theme.palette.action.hover : undefined,
                    cursor: disabled ? "default" : "pointer",
                    display: "flex",
                    height: virtualItem.size,
                    left: 0,
                    minHeight: TAG_OPTION_HEIGHT,
                    position: "absolute",
                    px: 0.5,
                    top: virtualItem.start,
                    width: "100%",
                  })}
                  onClick={() => commitToggle(tag)}
                >
                  <Checkbox
                    checked={isSelected}
                    size="small"
                    slotProps={{ input: { "aria-hidden": true, tabIndex: -1 } }}
                    sx={{ p: 0.5, pointerEvents: "none" }}
                  />
                  <Box
                    component="span"
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
                    {tag}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
      <LocalTaskTagColorPicker
        anchorEl={colorAnchor}
        disabled={disabled}
        tagCatalog={tagCatalog}
        tagName={colorTagName}
        onClose={() => {
          setColorAnchor(null);
          setColorTagName(null);
        }}
        onTagColorChange={onTagColorChange}
      />
    </>
  );
}
