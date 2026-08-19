/**
 * Project icon presets — React-free data and pick helpers for project
 * avatar icons and colors.
 *
 * Pure module: no React, no JSX. The component file
 * (`components/projectIcons.tsx`) derives its icon options from
 * `PROJECT_ICON_IDS` and re-exports the pick helpers for UI callers.
 * Commands import from here so they never depend on presentation code.
 */

/** Available project icon ids, in display order. */
export const PROJECT_ICON_IDS = [
  "folder",
  "code",
  "terminal",
  "rocket",
  "globe",
  "book",
  "bot",
  "layer",
  "settings",
  "briefcase",
  "alarm",
  "anchor",
  "aperture",
  "archive",
  "atom",
  "award",
  "badge",
  "bell",
  "bug",
  "bulb",
  "bus",
  "calendar",
  "camera",
  "cloud",
  "heart",
  "home",
  "image",
  "key",
  "lock",
  "map",
  "moon",
  "shield",
  "bag",
  "star",
  "sun",
  "user",
  "wrench",
] as const;

/** Default project icon id when nothing is configured. */
export const DEFAULT_PROJECT_ICON_ID = "folder";

/** Curated palette of background colors for project avatars. */
export const PROJECT_COLOR_PRESETS = ["#1E66F5", "#0F766E", "#CA8A04", "#DC2626", "#7C3AED", "#DB2777", "#0891B2"];

/** Picks a random icon id from the available project icon options. */
export function pickRandomProjectIcon(): string {
  const iconId = PROJECT_ICON_IDS[indexFor(PROJECT_ICON_IDS.length)];
  return iconId ?? DEFAULT_PROJECT_ICON_ID;
}

/** Picks a random color from the curated project color palette. */
export function pickRandomProjectColor(): string {
  const preset = PROJECT_COLOR_PRESETS[indexFor(PROJECT_COLOR_PRESETS.length)];
  if (preset) {
    return preset;
  }
  return "#1E66F5";
}

function indexFor(length: number): number {
  return Math.floor(Math.random() * Math.max(length, 1));
}
