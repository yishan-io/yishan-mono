import type { NotificationSettingsFocusItemId } from "@renderer/domains/notification";
import {
  BiBell,
  BiChip,
  type BiCog,
  BiCommand,
  BiDesktop,
  BiDownload,
  BiGitBranch,
  BiGroup,
  BiKey,
  BiLinkExternal,
  BiPalette,
  BiSolidKeyboard,
  BiTerminal,
  BiUser,
  BiWorld,
} from "react-icons/bi";
import { LuPuzzle, LuTags } from "react-icons/lu";
import {
  ACCOUNT_SEARCH_ITEMS,
  APPEARANCE_SEARCH_ITEMS,
  CLI_SEARCH_ITEMS,
  COMPUTER_USE_SEARCH_ITEMS,
  CUSTOMIZE_SEARCH_ITEMS,
  DAEMON_SEARCH_ITEMS,
  GIT_WORKSPACE_SEARCH_ITEMS,
  KEYBINDINGS_SEARCH_ITEMS,
  LANGUAGE_SEARCH_ITEMS,
  LINKS_SEARCH_ITEMS,
  LOCAL_TAGS_SEARCH_ITEMS,
  MEMBERS_SEARCH_ITEMS,
  MEMORY_SEARCH_ITEMS,
  NODES_SEARCH_ITEMS,
  NOTIFICATION_SEARCH_ITEMS,
  PROVIDERS_SEARCH_ITEMS,
  SERVICE_TOKEN_SEARCH_ITEMS,
  SKILLS_SEARCH_ITEMS,
  TERMINAL_SEARCH_ITEMS,
} from "./settingsSearchCatalogSections";

export type SettingsTab =
  | "account"
  | "appearance"
  | "cli"
  | "computerUse"
  | "customize"
  | "daemon"
  | "keybindings"
  | "links"
  | "localTags"
  | "members"
  | "memory"
  | "nodes"
  | "notifications"
  | "providers"
  | "serviceTokens"
  | "terminal"
  | "workspace";

export type SettingsNavSection = {
  titleKey: string;
  items: Array<{
    tab: SettingsTab;
    labelKey: string;
    icon: typeof BiCog;
  }>;
};

export type SettingsSearchCatalogItem = {
  id: string;
  tab: SettingsTab;
  icon: typeof BiCog;
  labelKey: string;
  sectionLabelKey: string;
  keywordKeys: string[];
  focusItemId?: NotificationSettingsFocusItemId | CustomizeFocusItemId;
};

export type CustomizeFocusItemId = "extensions" | "skills" | "agents";

export function isCustomizeFocusItemId(value: string | null | undefined): value is CustomizeFocusItemId {
  return value === "extensions" || value === "skills" || value === "agents";
}

export const SETTINGS_NAV_SECTIONS: SettingsNavSection[] = [
  {
    titleKey: "settings.sections.profile",
    items: [
      { tab: "account", labelKey: "settings.items.account", icon: BiUser },
      { tab: "appearance", labelKey: "settings.items.appearance", icon: BiPalette },
      { tab: "notifications", labelKey: "settings.items.notifications", icon: BiBell },
      { tab: "keybindings", labelKey: "settings.items.keybindings", icon: BiSolidKeyboard },
      { tab: "links", labelKey: "settings.items.links", icon: BiLinkExternal },
    ],
  },
  {
    titleKey: "settings.sections.organization",
    items: [
      { tab: "members", labelKey: "settings.items.members", icon: BiGroup },
      { tab: "nodes", labelKey: "settings.items.nodes", icon: BiDesktop },
      { tab: "serviceTokens", labelKey: "settings.items.serviceTokens", icon: BiKey },
    ],
  },
  {
    titleKey: "settings.sections.localTasks",
    items: [{ tab: "localTags", labelKey: "settings.items.tagManagement", icon: LuTags }],
  },
  {
    titleKey: "settings.sections.system",
    items: [
      { tab: "providers", labelKey: "settings.items.providers", icon: BiWorld },
      { tab: "customize", labelKey: "settings.items.customize", icon: LuPuzzle },
      { tab: "cli", labelKey: "settings.items.cli", icon: BiDownload },
      { tab: "workspace", labelKey: "settings.items.workspace", icon: BiGitBranch },
      { tab: "terminal", labelKey: "settings.items.terminal", icon: BiTerminal },
      { tab: "daemon", labelKey: "settings.items.daemon", icon: BiChip },
      { tab: "memory", labelKey: "settings.items.memory", icon: BiChip },
      { tab: "computerUse", labelKey: "settings.items.computerUse", icon: BiCommand },
    ],
  },
];
const SETTINGS_TAB_SEARCH_ITEMS: SettingsSearchCatalogItem[] = SETTINGS_NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    id: `tab-${item.tab}`,
    tab: item.tab,
    icon: item.icon,
    labelKey: item.labelKey,
    sectionLabelKey: "settings.title",
    keywordKeys: [],
  })),
);

export const SETTINGS_SEARCH_CATALOG: SettingsSearchCatalogItem[] = [
  ...SETTINGS_TAB_SEARCH_ITEMS,
  ...ACCOUNT_SEARCH_ITEMS,
  ...PROVIDERS_SEARCH_ITEMS,
  ...APPEARANCE_SEARCH_ITEMS,
  ...CLI_SEARCH_ITEMS,
  ...LANGUAGE_SEARCH_ITEMS,
  ...LINKS_SEARCH_ITEMS,
  ...SKILLS_SEARCH_ITEMS,
  ...CUSTOMIZE_SEARCH_ITEMS,
  ...MEMBERS_SEARCH_ITEMS,
  ...NODES_SEARCH_ITEMS,
  ...KEYBINDINGS_SEARCH_ITEMS,
  ...COMPUTER_USE_SEARCH_ITEMS,
  ...DAEMON_SEARCH_ITEMS,
  ...MEMORY_SEARCH_ITEMS,
  ...LOCAL_TAGS_SEARCH_ITEMS,
  ...GIT_WORKSPACE_SEARCH_ITEMS,
  ...TERMINAL_SEARCH_ITEMS,
  ...SERVICE_TOKEN_SEARCH_ITEMS,
  ...NOTIFICATION_SEARCH_ITEMS,
];
