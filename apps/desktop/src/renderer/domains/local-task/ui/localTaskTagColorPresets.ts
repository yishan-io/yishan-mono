import type { Theme } from "@mui/material";
import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens/v1";
import type { LocalTaskTagCatalogEntry, LocalTaskTagColor } from "../localTaskTypes";

/** Returns the dedicated token color assigned to a daemon-owned tag color. */
export function getLocalTaskTagColorValue(color: LocalTaskTagColor, theme: Theme): string {
  return SEMANTIC_COLOR_TOKENS[theme.palette.mode].tag[color];
}

/** Looks up a catalog entry from an exact daemon-provided display alias. */
export function getLocalTaskTagCatalogEntry(
  tag: string,
  catalog: LocalTaskTagCatalogEntry[],
): LocalTaskTagCatalogEntry | undefined {
  return catalog.find((entry) => entry.aliases.includes(tag));
}

/** Looks up a catalog preset color from an exact daemon-provided display alias. */
export function getLocalTaskTagColor(tag: string, catalog: LocalTaskTagCatalogEntry[]): LocalTaskTagColor | null {
  return getLocalTaskTagCatalogEntry(tag, catalog)?.color ?? null;
}

/** Returns whether a tag is selected using only exact daemon-provided aliases. */
export function isLocalTaskTagSelected(
  tag: string,
  selectedTags: string[],
  catalog: LocalTaskTagCatalogEntry[],
): boolean {
  const catalogEntry = getLocalTaskTagCatalogEntry(tag, catalog);
  if (!catalogEntry) return selectedTags.includes(tag);

  return selectedTags.some(
    (selectedTag) => getLocalTaskTagCatalogEntry(selectedTag, catalog)?.key === catalogEntry.key,
  );
}

/** Toggles a tag selection, resolving matching daemon aliases without client-side folding. */
export function toggleLocalTaskTagSelection(
  tag: string,
  selectedTags: string[],
  catalog: LocalTaskTagCatalogEntry[],
): string[] {
  const catalogEntry = getLocalTaskTagCatalogEntry(tag, catalog);
  if (!catalogEntry) {
    return selectedTags.includes(tag)
      ? selectedTags.filter((selectedTag) => selectedTag !== tag)
      : [...selectedTags, tag];
  }

  const selectedAlias = selectedTags.find(
    (selectedTag) => getLocalTaskTagCatalogEntry(selectedTag, catalog)?.key === catalogEntry.key,
  );
  return selectedAlias ? selectedTags.filter((selectedTag) => selectedTag !== selectedAlias) : [...selectedTags, tag];
}
