import { DEFAULT_PROJECT_ICON_ID, PROJECT_COLOR_PRESETS, PROJECT_ICON_IDS } from "./ui/projectIconPresets";

/**
 * Project icon default-selection policy (desktop8 Phase 30).
 *
 * Random pick helpers moved out of Model (Model must not read a random
 * source); they live as a named project concept so Commands, State, and UI
 * can all import them (a Feature-only home would break the command/state
 * callers).
 */

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
