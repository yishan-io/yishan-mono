import type { ReactNode } from "react";
import type { IconType } from "react-icons/lib";
import {
  LuAlarmClock,
  LuAnchor,
  LuAperture,
  LuArchive,
  LuAtom,
  LuAward,
  LuBadgeCheck,
  LuBell,
  LuBookOpen,
  LuBot,
  LuBriefcase,
  LuBug,
  LuBus,
  LuCalendar,
  LuCamera,
  LuCloud,
  LuCode,
  LuFolder,
  LuGlobe,
  LuHeart,
  LuHouse,
  LuImage,
  LuKey,
  LuLayers,
  LuLightbulb,
  LuLock,
  LuMap,
  LuMoon,
  LuRocket,
  LuSettings,
  LuShield,
  LuShoppingBag,
  LuSquareTerminal,
  LuStar,
  LuSun,
  LuUser,
  LuWrench,
} from "react-icons/lu";

type ProjectIconOption = {
  id: string;
  Icon: IconType;
};

export const PROJECT_ICON_OPTIONS: ProjectIconOption[] = [
  { id: "folder", Icon: LuFolder },
  { id: "code", Icon: LuCode },
  { id: "terminal", Icon: LuSquareTerminal },
  { id: "rocket", Icon: LuRocket },
  { id: "globe", Icon: LuGlobe },
  { id: "book", Icon: LuBookOpen },
  { id: "bot", Icon: LuBot },
  { id: "layer", Icon: LuLayers },
  { id: "settings", Icon: LuSettings },
  { id: "briefcase", Icon: LuBriefcase },
  { id: "alarm", Icon: LuAlarmClock },
  { id: "anchor", Icon: LuAnchor },
  { id: "aperture", Icon: LuAperture },
  { id: "archive", Icon: LuArchive },
  { id: "atom", Icon: LuAtom },
  { id: "award", Icon: LuAward },
  { id: "badge", Icon: LuBadgeCheck },
  { id: "bell", Icon: LuBell },
  { id: "bug", Icon: LuBug },
  { id: "bulb", Icon: LuLightbulb },
  { id: "bus", Icon: LuBus },
  { id: "calendar", Icon: LuCalendar },
  { id: "camera", Icon: LuCamera },
  { id: "cloud", Icon: LuCloud },
  { id: "heart", Icon: LuHeart },
  { id: "home", Icon: LuHouse },
  { id: "image", Icon: LuImage },
  { id: "key", Icon: LuKey },
  { id: "lock", Icon: LuLock },
  { id: "map", Icon: LuMap },
  { id: "moon", Icon: LuMoon },
  { id: "shield", Icon: LuShield },
  { id: "bag", Icon: LuShoppingBag },
  { id: "star", Icon: LuStar },
  { id: "sun", Icon: LuSun },
  { id: "user", Icon: LuUser },
  { id: "wrench", Icon: LuWrench },
];

export const DEFAULT_PROJECT_ICON_ID = "folder";

/** Finds a configured icon option by its persisted id. */
export function findProjectIconOption(iconId?: string): ProjectIconOption | undefined {
  return PROJECT_ICON_OPTIONS.find((option) => option.id === iconId);
}

/** Renders a repo icon, falling back to initial letter or default folder icon. */
export function renderProjectIcon(iconId: string | undefined, size: number): ReactNode {
  const option = findProjectIconOption(iconId);
  if (option) {
    return <option.Icon size={size} />;
  }

  const normalized = iconId?.trim() ?? "";
  if (normalized) {
    return normalized.charAt(0).toUpperCase();
  }

  return <LuFolder size={size} />;
}

/** Curated palette of background colors for project avatars. */
export const PROJECT_COLOR_PRESETS = [
  "#1E66F5",
  "#0F766E",
  "#CA8A04",
  "#DC2626",
  "#7C3AED",
  "#DB2777",
  "#0891B2",
];

/** Picks a random icon id from the available project icon options. */
export function pickRandomProjectIcon(): string {
  const index = Math.floor(Math.random() * PROJECT_ICON_OPTIONS.length);
  return PROJECT_ICON_OPTIONS[index]!.id;
}

/** Picks a random color from the curated project color palette. */
export function pickRandomProjectColor(): string {
  const index = Math.floor(Math.random() * PROJECT_COLOR_PRESETS.length);
  return PROJECT_COLOR_PRESETS[index]!;
}

export const REPO_ICON_OPTIONS = PROJECT_ICON_OPTIONS;
export const DEFAULT_REPO_ICON_ID = DEFAULT_PROJECT_ICON_ID;
export const findRepoIconOption = findProjectIconOption;
export const renderRepoIcon = renderProjectIcon;
