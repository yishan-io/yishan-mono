/**
 * Project icon presets — React-free visual data for project avatar icons and
 * colors (desktop8 Phase 30: moved out of Model into the Project UI layer).
 *
 * The component file (`components/projectIcons.tsx`) derives its icon options
 * from `PROJECT_ICON_IDS`; the default-selection policy (random pick) lives in
 * `../services/projectIconSelection`.
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
