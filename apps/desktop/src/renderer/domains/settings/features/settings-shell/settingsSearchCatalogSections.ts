import { NOTIFICATION_SETTINGS_SEARCH_ITEMS } from "@renderer/domains/notification";
import {
  BiBell,
  BiBot,
  BiChip,
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
import { LuHammer, LuPuzzle } from "react-icons/lu";
import type { SettingsSearchCatalogItem } from "./settingsSearchCatalog";

/**
 * Per-settings-section search catalogs (desktop8 Phase 33: split from
 * settingsSearchCatalog.ts by owning settings section).
 */

export const TERMINAL_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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

export const DAEMON_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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

export const COMPUTER_USE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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

export const ACCOUNT_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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
export const APPEARANCE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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
      "settings.appearance.markdown.previewFontSize.label",
      "settings.appearance.markdown.previewFontSize.options.small",
      "settings.appearance.markdown.previewFontSize.options.medium",
      "settings.appearance.markdown.previewFontSize.options.large",
      "settings.appearance.markdown.previewWidth.label",
      "settings.appearance.markdown.previewWidth.options.readable",
      "settings.appearance.markdown.previewWidth.options.full",
      "settings.appearance.markdown.outlineVisible.label",
      "settings.appearance.editor.theme.label",
      "settings.appearance.editor.theme.description",
      "settings.appearance.editor.fontSize.label",
      "settings.appearance.editor.fontSize.description",
      "settings.appearance.editor.wordWrap.label",
      "settings.appearance.editor.wordWrap.description",
      "settings.appearance.markdown.outlineVisible.description",
      "settings.items.appearance",
    ],
  },
  {
    id: "appearance-agent-chat-width",
    tab: "appearance",
    icon: BiBot,
    labelKey: "settings.appearance.agentChat.title",
    sectionLabelKey: "settings.items.appearance",
    keywordKeys: [
      "settings.appearance.agentChat.description",
      "settings.appearance.agentChat.width.label",
      "settings.appearance.agentChat.width.description",
      "settings.appearance.agentChat.width.options.fixed",
      "settings.appearance.agentChat.width.options.full",
    ],
  },
];
export const LANGUAGE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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
export const LINKS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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
export const CUSTOMIZE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "customize-extensions",
    tab: "customize",
    icon: LuPuzzle,
    labelKey: "settings.customize.extensions.title",
    sectionLabelKey: "settings.items.customize",
    keywordKeys: [
      "settings.customize.extensions.description",
      "settings.customize.extensions.official",
      "settings.customize.extensions.userInstalled",
      "settings.customize.extensions.installed",
      "settings.customize.extensions.actions.add",
      "settings.customize.extensions.actions.update",
      "settings.customize.extensions.actions.remove",
    ],
    focusItemId: "extensions",
  },
  {
    id: "customize-agents",
    tab: "customize",
    icon: BiBot,
    labelKey: "settings.customize.agents.title",
    sectionLabelKey: "settings.items.customize",
    keywordKeys: [
      "settings.customize.agents.description",
      "settings.customize.agents.official",
      "settings.customize.agents.managed",
    ],
    focusItemId: "agents",
  },
];

export const SKILLS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "skills-manager",
    tab: "customize",
    icon: LuHammer,
    labelKey: "settings.skills.title",
    sectionLabelKey: "settings.items.customize",
    keywordKeys: [
      "settings.skills.description",
      "settings.skills.sourceLabel",
      "settings.skills.installed",
      "settings.skills.notInstalled",
      "settings.skills.official",
    ],
    focusItemId: "skills",
  },
];
export const NODES_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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
export const MEMBERS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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
export const KEYBINDINGS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "keybindings-list",
    tab: "keybindings",
    icon: BiSolidKeyboard,
    labelKey: "keybindings.title",
    sectionLabelKey: "settings.items.keybindings",
    keywordKeys: ["keybindings.subtitle", "keybindings.scope.global", "keybindings.scope.workspace"],
  },
];
export const CLI_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "cli-supported",
    tab: "cli",
    icon: BiDownload,
    labelKey: "settings.cli.title",
    sectionLabelKey: "settings.items.cli",
    keywordKeys: [
      "settings.cli.description",
      "settings.cli.github.label",
      "settings.cli.github.description",
      "settings.cli.github.notInstalled",
      "settings.cli.github.notLoggedIn",
      "settings.cli.pi.title",
      "settings.cli.pi.description",
      "settings.daemon.cli.title",
    ],
  },
  {
    id: "cli-agents",
    tab: "cli",
    icon: BiBot,
    labelKey: "settings.cli.agentsTitle",
    sectionLabelKey: "settings.items.cli",
    keywordKeys: [
      "settings.agents.description",
      "settings.agents.status.detected",
      "settings.agents.status.notDetected",
      "settings.agents.inUse",
    ],
  },
  // Agent-kind search entries load lazily from settingsSearchCatalogAgent
  // (desktop7 Phase 22): the Settings index must not evaluate the Agent index
  // at module-load time (Agent features import the Settings index back, and
  // the re-entrancy cycle breaks mocked test graphs).
];
export const PROVIDERS_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
  {
    id: "providers-list",
    tab: "providers",
    icon: BiWorld,
    labelKey: "settings.providers.title",
    sectionLabelKey: "settings.items.providers",
    keywordKeys: [
      "settings.providers.description",
      "settings.providers.keywords.provider",
      "settings.providers.keywords.apiKey",
      "settings.providers.keywords.model",
    ],
  },
];

export const GIT_WORKSPACE_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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

export const NOTIFICATION_SEARCH_ITEMS: SettingsSearchCatalogItem[] = NOTIFICATION_SETTINGS_SEARCH_ITEMS.map(
  (item) => ({
    id: `notification-item-${item.id}`,
    tab: "notifications",
    icon: BiBell,
    labelKey: item.labelKey,
    sectionLabelKey: "settings.items.notifications",
    keywordKeys: item.keywordKeys,
    focusItemId: item.id,
  }),
);

export const SERVICE_TOKEN_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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
export const MEMORY_SEARCH_ITEMS: SettingsSearchCatalogItem[] = [
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
      "settings.memory.summarizer.model.label",
    ],
  },
];
