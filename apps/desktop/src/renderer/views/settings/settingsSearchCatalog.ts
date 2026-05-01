import { BiBell, BiChip, type BiCog, BiGitBranch, BiPalette, BiTerminal, BiUser } from "react-icons/bi";
import { AGENT_SETTINGS_LABEL_KEY_BY_KIND, SUPPORTED_DESKTOP_AGENT_KINDS } from "../../helpers/agentSettings";
import {
  NOTIFICATION_SETTINGS_SEARCH_ITEMS,
  type NotificationSettingsFocusItemId,
} from "./notificationSettingsCatalog";

export type SettingsTab = "account" | "agents" | "appearance" | "daemon" | "notifications" | "terminal" | "workspace";

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
  focusItemId?: NotificationSettingsFocusItemId;
};

export const SETTINGS_NAV_SECTIONS: SettingsNavSection[] = [
  {
    titleKey: "settings.sections.personal",
    items: [
      { tab: "account", labelKey: "settings.items.account", icon: BiUser },
      { tab: "agents", labelKey: "settings.items.agents", icon: BiChip },
      { tab: "appearance", labelKey: "settings.items.appearance", icon: BiPalette },
      { tab: "daemon", labelKey: "settings.items.daemon", icon: BiChip },
      { tab: "notifications", labelKey: "settings.items.notifications", icon: BiBell },
      { tab: "terminal", labelKey: "settings.items.terminal", icon: BiTerminal },
    ],
  },
  {
    titleKey: "settings.sections.git",
    items: [{ tab: "workspace", labelKey: "settings.items.workspace", icon: BiGitBranch }],
  },
];

const TERMINAL_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "terminal-sessions",
    tab: "terminal",
    icon: BiTerminal,
    labelKey: "settings.terminal.title",
    sectionLabelKey: "settings.items.terminal",
    keywordKeys: [
      "settings.terminal.description",
      "settings.terminal.columns.workspace",
      "settings.terminal.columns.repo",
      "settings.terminal.columns.pid",
      "settings.terminal.columns.status",
      "settings.terminal.actions.kill",
    ],
  },
];

const DAEMON_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "daemon-runtime",
    tab: "daemon",
    icon: BiChip,
    labelKey: "settings.daemon.title",
    sectionLabelKey: "settings.items.daemon",
    keywordKeys: [
      "settings.daemon.description",
      "settings.daemon.rows.status",
      "settings.daemon.rows.version",
      "settings.daemon.rows.id",
      "settings.daemon.rows.websocket",
      "settings.daemon.actions.refresh",
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

const ACCOUNT_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "account-profile",
    tab: "account",
    icon: BiUser,
    labelKey: "settings.account.title",
    sectionLabelKey: "settings.items.account",
    keywordKeys: [
      "settings.account.description",
      "settings.account.fields.name",
      "settings.account.fields.email",
      "settings.account.fields.userId",
    ],
  },
];

const APPEARANCE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "appearance-theme",
    tab: "appearance",
    icon: BiPalette,
    labelKey: "settings.appearance.theme.title",
    sectionLabelKey: "settings.items.appearance",
    keywordKeys: [
      "settings.appearance.theme.description",
      "settings.appearance.theme.options.light",
      "settings.appearance.theme.options.dark",
      "settings.appearance.theme.options.system",
      "settings.items.appearance",
    ],
  },
];

const AGENT_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "agent-settings",
    tab: "agents",
    icon: BiChip,
    labelKey: "settings.agents.title",
    sectionLabelKey: "settings.items.agents",
    keywordKeys: [
      "settings.agents.description",
      "settings.agents.status.detected",
      "settings.agents.status.notDetected",
      "settings.agents.status.checking",
      "settings.agents.inUse",
      "settings.agents.actions.recheckAll",
    ],
  },
  ...SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => ({
    id: `agent-item-${agentKind}`,
    tab: "agents" as const,
    icon: BiChip,
    labelKey: AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind],
    sectionLabelKey: "settings.items.agents",
    keywordKeys: ["settings.agents.inUse", "settings.agents.status.detected", "settings.agents.status.notDetected"],
  })),
];

const GIT_WORKSPACE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "git-workspace-branch-prefix",
    tab: "workspace",
    icon: BiGitBranch,
    labelKey: "settings.git.workspace.title",
    sectionLabelKey: "settings.items.workspace",
    keywordKeys: [
      "settings.git.workspace.description",
      "settings.git.workspace.prefixModeLabel",
      "settings.git.workspace.prefix.none",
      "settings.git.workspace.prefix.user",
      "settings.git.workspace.prefix.custom",
      "settings.git.workspace.customPrefixLabel",
      "settings.git.workspace.previewLabel",
    ],
  },
];

const NOTIFICATION_SEARCH_ITEMS: SettingsSearchCatalogItem[] = NOTIFICATION_SETTINGS_SEARCH_ITEMS.map((item) => ({
  id: `notification-item-${item.id}`,
  tab: "notifications",
  icon: BiBell,
  labelKey: item.labelKey,
  sectionLabelKey: "settings.items.notifications",
  keywordKeys: item.keywordKeys,
  focusItemId: item.id,
}));

export const SETTINGS_SEARCH_CATALOG: SettingsSearchCatalogItem[] = [
  ...SETTINGS_TAB_SEARCH_ITEMS,
  ...ACCOUNT_SEARCH_ITEMS,
  ...AGENT_SEARCH_ITEMS,
  ...APPEARANCE_SEARCH_ITEMS,
  ...DAEMON_SEARCH_ITEMS,
  ...GIT_WORKSPACE_SEARCH_ITEMS,
  ...TERMINAL_SEARCH_ITEMS,
  ...NOTIFICATION_SEARCH_ITEMS,
];
