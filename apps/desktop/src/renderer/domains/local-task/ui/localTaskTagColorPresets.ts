import type { LocalTaskTagCatalogEntry } from "../localTaskTypes";

/** Canonical hex values for the six named presets, keyed by their i18n slug. */
export const LOCAL_TASK_TAG_PRESET_COLORS = {
  amber: "#F59E0B",
  blue: "#3B82F6",
  green: "#22C55E",
  purple: "#A855F7",
  red: "#EF4444",
  teal: "#14B8A6",
} as const;

export type LocalTaskTagPresetName = keyof typeof LOCAL_TASK_TAG_PRESET_COLORS;

/** Returns the canonical hex for a preset name, or undefined when not a preset. */
export function getPresetHex(name: LocalTaskTagPresetName): string {
  return LOCAL_TASK_TAG_PRESET_COLORS[name];
}

/** Returns true when hex matches one of the six canonical presets. */
export function isPresetHex(hex: string): boolean {
  return Object.values(LOCAL_TASK_TAG_PRESET_COLORS).includes(
    hex as (typeof LOCAL_TASK_TAG_PRESET_COLORS)[LocalTaskTagPresetName],
  );
}

/** Looks up a catalog entry from an exact daemon-provided display alias. */
export function getLocalTaskTagCatalogEntry(
  tag: string,
  catalog: LocalTaskTagCatalogEntry[],
): LocalTaskTagCatalogEntry | undefined {
  return catalog.find((entry) => entry.aliases.includes(tag));
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
