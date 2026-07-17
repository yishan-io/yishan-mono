import {
  BiBell,
  BiBot,
  BiChip,
  type BiCog,
  BiCommand,
  BiDesktop,
  BiGitBranch,
  BiGroup,
  BiKey,
  BiLinkExternal,
  BiPalette,
  BiPlug,
  BiSolidKeyboard,
  BiTerminal,
  BiUser,
  BiWorld,
} from "react-icons/bi";
import { LuHammer } from "react-icons/lu";
import { AGENT_SETTINGS_LABEL_KEY_BY_KIND, SUPPORTED_DESKTOP_AGENT_KINDS } from "../../helpers/agentSettings";
import {
  NOTIFICATION_SETTINGS_SEARCH_ITEMS,
  type NotificationSettingsFocusItemId,
} from "./notifications/notificationSettingsCatalog";

export type SettingsTab =
  | "account"
  | "agents"
  | "appearance"
  | "computerUse"
  | "daemon"
  | "integrations"
  | "keybindings"
  | "links"
  | "members"
  | "memory"
  | "nodes"
  | "notifications"
  | "serviceTokens"
  | "skills"
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
  focusItemId?: NotificationSettingsFocusItemId;
};

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
    titleKey: "settings.sections.system",
    items: [
      { tab: "integrations", labelKey: "settings.items.integrations", icon: BiPlug },
      { tab: "skills", labelKey: "settings.items.skills", icon: LuHammer },
      { tab: "computerUse", labelKey: "settings.items.computerUse", icon: BiCommand },
      { tab: "workspace", labelKey: "settings.items.workspace", icon: BiGitBranch },
      { tab: "terminal", labelKey: "settings.items.terminal", icon: BiTerminal },
      { tab: "daemon", labelKey: "settings.items.daemon", icon: BiChip },
      { tab: "agents", labelKey: "settings.items.agents", icon: BiBot },
      { tab: "memory", labelKey: "settings.items.memory", icon: BiChip },
    ],
  },
];

const TERMINAL_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "terminal-voice-input",
    tab: "terminal",
    icon: BiTerminal,
    labelKey: "settings.terminal.voice.title",
    sectionLabelKey: "settings.items.terminal",
    keywordKeys: [
      "settings.terminal.voice.description",
      "settings.terminal.voice.enable.label",
      "settings.terminal.voice.enable.description",
    ],
  },
  {
    id: "terminal-voice-auto-enter",
    tab: "terminal",
    icon: BiTerminal,
    labelKey: "settings.terminal.voice.autoEnter.label",
    sectionLabelKey: "settings.items.terminal",
    keywordKeys: ["settings.terminal.voice.autoEnter.description", "settings.terminal.voice.title"],
  },
  {
    id: "terminal-voice-shortcut",
    tab: "keybindings",
    icon: BiSolidKeyboard,
    labelKey: "keybindings.actions.toggleVoiceInput",
    sectionLabelKey: "settings.items.keybindings",
    keywordKeys: ["settings.terminal.voice.title"],
  },
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
  {
    id: "daemon-controls",
    tab: "daemon",
    icon: BiChip,
    labelKey: "settings.daemon.controls.title",
    sectionLabelKey: "settings.items.daemon",
    keywordKeys: [
      "settings.daemon.controls.description",
      "settings.daemon.restart.label",
      "settings.daemon.restart.description",
      "settings.daemon.restart.action",
      "settings.daemon.quitOnExit.label",
      "settings.daemon.quitOnExit.description",
    ],
  },
];

const COMPUTER_USE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "computer-use-features",
    tab: "computerUse",
    icon: BiCommand,
    labelKey: "settings.computerUse.title",
    sectionLabelKey: "settings.items.computerUse",
    keywordKeys: [
      "settings.computerUse.description",
      "settings.computerUse.enabled.label",
      "settings.computerUse.observe.label",
      "settings.computerUse.capture.label",
      "settings.computerUse.inspect.label",
      "settings.computerUse.actions.label",
      "settings.computerUse.mouse.label",
      "settings.computerUse.keyboard.label",
      "settings.computerUse.clipboardRead.label",
      "settings.computerUse.clipboardWrite.label",
      "settings.computerUse.applicationControl.label",
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
      "settings.appearance.markdown.theme.label",
      "settings.appearance.markdown.theme.options.inherit",
      "settings.appearance.markdown.theme.options.light",
      "settings.appearance.markdown.theme.options.dark",
      "settings.appearance.markdown.defaultViewMode.label",
      "settings.appearance.markdown.defaultViewMode.options.edit",
      "settings.appearance.markdown.defaultViewMode.options.preview",
      "settings.appearance.markdown.defaultViewMode.options.split",
      "settings.appearance.markdown.previewFontSize.label",
      "settings.appearance.markdown.previewFontSize.options.small",
      "settings.appearance.markdown.previewFontSize.options.medium",
      "settings.appearance.markdown.previewFontSize.options.large",
      "settings.appearance.markdown.previewWidth.label",
      "settings.appearance.markdown.previewWidth.options.readable",
      "settings.appearance.markdown.previewWidth.options.full",
      "settings.appearance.markdown.outlineVisible.label",
      "settings.appearance.markdown.outlineVisible.description",
      "settings.items.appearance",
    ],
  },
];
const LANGUAGE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "language-selection",
    tab: "appearance",
    icon: BiWorld,
    labelKey: "settings.language.title",
    sectionLabelKey: "settings.items.appearance",
    keywordKeys: [
      "settings.language.description",
      "settings.language.selectLabel",
      "settings.language.options.en",
      "settings.language.options.zh",
    ],
  },
];
const LINKS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "link-target",
    tab: "links",
    icon: BiLinkExternal,
    labelKey: "settings.links.title",
    sectionLabelKey: "settings.items.links",
    keywordKeys: [
      "settings.links.description",
      "settings.links.targetLabel",
      "settings.links.options.built-in",
      "settings.links.options.external",
    ],
  },
];
const SKILLS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "skills-manager",
    tab: "skills",
    icon: LuHammer,
    labelKey: "settings.skills.title",
    sectionLabelKey: "settings.items.skills",
    keywordKeys: [
      "settings.skills.description",
      "settings.skills.sourceLabel",
      "settings.skills.sourcePlaceholder",
      "settings.skills.installed",
      "settings.skills.notInstalled",
      "settings.skills.official",
      "settings.skills.thirdParty",
      "settings.skills.actions.add",
      "settings.skills.actions.install",
      "settings.skills.actions.update",
      "settings.skills.actions.uninstall",
    ],
  },
];
const NODES_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "nodes-list",
    tab: "nodes",
    icon: BiDesktop,
    labelKey: "settings.nodes.title",
    sectionLabelKey: "settings.items.nodes",
    keywordKeys: [
      "settings.nodes.description",
      "settings.nodes.columns.name",
      "settings.nodes.columns.type",
      "settings.nodes.columns.version",
      "settings.nodes.columns.owner",
      "settings.nodes.columns.status",
      "settings.nodes.types.private",
      "settings.nodes.types.shared",
      "settings.nodes.status.online",
      "settings.nodes.status.offline",
    ],
  },
];
const MEMBERS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "members-list",
    tab: "members",
    icon: BiGroup,
    labelKey: "settings.members.title",
    sectionLabelKey: "settings.items.members",
    keywordKeys: [
      "settings.members.description",
      "settings.members.columns.member",
      "settings.members.columns.email",
      "settings.members.columns.role",
      "settings.members.columns.userId",
      "settings.members.empty",
      "settings.members.loadError",
    ],
  },
];
const KEYBINDINGS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "keybindings-list",
    tab: "keybindings",
    icon: BiSolidKeyboard,
    labelKey: "keybindings.title",
    sectionLabelKey: "settings.items.keybindings",
    keywordKeys: ["keybindings.subtitle", "keybindings.scope.global", "keybindings.scope.workspace"],
  },
];
const INTEGRATION_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "integration-github",
    tab: "integrations",
    icon: BiPlug,
    labelKey: "settings.integrations.title",
    sectionLabelKey: "settings.items.integrations",
    keywordKeys: [
      "settings.integrations.description",
      "settings.integrations.github.label",
      "settings.integrations.github.description",
      "settings.integrations.status.connected",
      "settings.integrations.github.notInstalled",
      "settings.integrations.github.notLoggedIn",
    ],
  },
];
const AGENT_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "agent-settings",
    tab: "agents",
    icon: BiBot,
    labelKey: "settings.agents.title",
    sectionLabelKey: "settings.items.agents",
    keywordKeys: [
      "settings.agents.description",
      "settings.agents.status.detected",
      "settings.agents.status.notDetected",
      "settings.agents.status.checking",
      "settings.agents.default.label",
      "settings.agents.inUse",
      "settings.agents.actions.rescanAll",
    ],
  },
  ...SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => ({
    id: `agent-item-${agentKind}`,
    tab: "agents" as const,
    icon: BiBot,
    labelKey: AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind],
    sectionLabelKey: "settings.items.agents",
    keywordKeys: [
      "settings.agents.default.label",
      "settings.agents.inUse",
      "settings.agents.status.detected",
      "settings.agents.status.notDetected",
    ],
  })),
];
const GIT_WORKSPACE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "workspace-default-context",
    tab: "workspace",
    icon: BiGitBranch,
    labelKey: "settings.workspace.defaultContext.label",
    sectionLabelKey: "settings.items.workspace",
    keywordKeys: [
      "settings.workspace.defaultContext.description",
      "settings.workspace.defaultContext.status.enabled",
      "settings.workspace.defaultContext.status.disabled",
    ],
  },
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

const SERVICE_TOKEN_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "service-tokens-list",
    tab: "serviceTokens",
    icon: BiKey,
    labelKey: "settings.serviceTokens.title",
    sectionLabelKey: "settings.items.serviceTokens",
    keywordKeys: [
      "settings.serviceTokens.description",
      "settings.serviceTokens.columns.name",
      "settings.serviceTokens.columns.token",
      "settings.serviceTokens.columns.status",
    ],
  },
];
const MEMORY_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "memory-summarizer",
    tab: "memory",
    icon: BiChip,
    labelKey: "settings.memory.title",
    sectionLabelKey: "settings.items.memory",
    keywordKeys: [
      "settings.memory.description",
      "settings.memory.summarizer.title",
      "settings.memory.summarizer.enabled.label",
      "settings.memory.summarizer.agentKind.label",
      "settings.memory.summarizer.model.label",
    ],
  },
];

export const SETTINGS_SEARCH_CATALOG: SettingsSearchCatalogItem[] = [
  ...SETTINGS_TAB_SEARCH_ITEMS,
  ...ACCOUNT_SEARCH_ITEMS,
  ...AGENT_SEARCH_ITEMS,
  ...APPEARANCE_SEARCH_ITEMS,
  ...INTEGRATION_SEARCH_ITEMS,
  ...LANGUAGE_SEARCH_ITEMS,
  ...LINKS_SEARCH_ITEMS,
  ...SKILLS_SEARCH_ITEMS,
  ...MEMBERS_SEARCH_ITEMS,
  ...NODES_SEARCH_ITEMS,
  ...KEYBINDINGS_SEARCH_ITEMS,
  ...COMPUTER_USE_SEARCH_ITEMS,
  ...DAEMON_SEARCH_ITEMS,
  ...MEMORY_SEARCH_ITEMS,
  ...GIT_WORKSPACE_SEARCH_ITEMS,
  ...TERMINAL_SEARCH_ITEMS,
  ...SERVICE_TOKEN_SEARCH_ITEMS,
  ...NOTIFICATION_SEARCH_ITEMS,
];
