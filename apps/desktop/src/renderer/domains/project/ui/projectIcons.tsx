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
import { DEFAULT_PROJECT_ICON_ID, PROJECT_COLOR_PRESETS, PROJECT_ICON_IDS } from "./projectIconPresets";

const PROJECT_ICON_BY_ID: Record<string, IconType> = {
  folder: LuFolder,
  code: LuCode,
  terminal: LuSquareTerminal,
  rocket: LuRocket,
  globe: LuGlobe,
  book: LuBookOpen,
  bot: LuBot,
  layer: LuLayers,
  settings: LuSettings,
  briefcase: LuBriefcase,
  alarm: LuAlarmClock,
  anchor: LuAnchor,
  aperture: LuAperture,
  archive: LuArchive,
  atom: LuAtom,
  award: LuAward,
  badge: LuBadgeCheck,
  bell: LuBell,
  bug: LuBug,
  bulb: LuLightbulb,
  bus: LuBus,
  calendar: LuCalendar,
  camera: LuCamera,
  cloud: LuCloud,
  heart: LuHeart,
  home: LuHouse,
  image: LuImage,
  key: LuKey,
  lock: LuLock,
  map: LuMap,
  moon: LuMoon,
  shield: LuShield,
  bag: LuShoppingBag,
  star: LuStar,
  sun: LuSun,
  user: LuUser,
  wrench: LuWrench,
};

type ProjectIconOption = {
  id: string;
  Icon: IconType;
};

export const PROJECT_ICON_OPTIONS: ProjectIconOption[] = PROJECT_ICON_IDS.map((id) => {
  const Icon = PROJECT_ICON_BY_ID[id];
  return { id, Icon: Icon ?? LuFolder };
});

export { DEFAULT_PROJECT_ICON_ID, PROJECT_COLOR_PRESETS };

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

export const REPO_ICON_OPTIONS = PROJECT_ICON_OPTIONS;
export const DEFAULT_REPO_ICON_ID = DEFAULT_PROJECT_ICON_ID;
export const findRepoIconOption = findProjectIconOption;
export const renderRepoIcon = renderProjectIcon;
