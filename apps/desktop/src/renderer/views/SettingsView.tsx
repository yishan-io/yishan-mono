import {
  Box,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BiCog } from "react-icons/bi";
import { RxExit } from "react-icons/rx";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SearchInput } from "../components/SearchInput";
import { SettingsErrorBoundary, SettingsPageLayout, SettingsSectionHeader } from "../components/settings";
import { ThemePreferencePicker } from "../components/settings/ThemePreferencePicker";
import { getRendererPlatform } from "../helpers/platform";
import { useThemePreference } from "../hooks/useThemePreference";
import { AccountSettingsView } from "./settings/AccountSettingsView";
import { AgentSettingsView } from "./settings/AgentSettingsView";
import { ComputerUseSettingsView } from "./settings/ComputerUseSettingsView";
import { DaemonSettingsView } from "./settings/DaemonSettingsView";
import { IntegrationSettingsView } from "./settings/IntegrationSettingsView";
import { KeybindingsSettingsView } from "./settings/KeybindingsSettingsView";
import { LanguageSettingsView } from "./settings/LanguageSettingsView";
import { LinkSettingsView } from "./settings/LinkSettingsView";
import { MarkdownSettingsView } from "./settings/MarkdownSettingsView";
import { MemberSettingsView } from "./settings/MemberSettingsView";
import { MemorySettingsView } from "./settings/MemorySettingsView";
import { NodesSettingsView } from "./settings/NodesSettingsView";
import { NotificationSettingsView } from "./settings/NotificationSettingsView";
import { ServiceTokenSettingsView } from "./settings/ServiceTokenSettingsView";
import { SkillsSettingsView } from "./settings/SkillsSettingsView";
import { TerminalSettingsView } from "./settings/TerminalSettingsView";
import { WorkspaceSettingsView } from "./settings/WorkspaceSettingsView";
import {
  type NotificationSettingsFocusItemId,
  isNotificationSettingsFocusItemId,
} from "./settings/notificationSettingsCatalog";
import { SETTINGS_NAV_SECTIONS, SETTINGS_SEARCH_CATALOG, type SettingsTab } from "./settings/settingsSearchCatalog";

type SettingsSearchResult = {
  id: string;
  tab: SettingsTab;
  icon: typeof BiCog;
  label: string;
  sectionLabel: string;
  focusItemId?: NotificationSettingsFocusItemId | "agentProviders";
  rank: number;
};

/**
 * Wraps one menu label in standardized body2 typography used across workspace sidebars.
 */
function renderSidebarLabel(label: ReactNode) {
  return (
    <Typography variant="body2" sx={{ lineHeight: 1.35 }}>
      {label}
    </Typography>
  );
}

function renderExperimentalSidebarLabel(label: string, chipLabel: string) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
      <Typography variant="body2" sx={{ lineHeight: 1.35 }} noWrap>
        {label}
      </Typography>
      <Chip size="small" label={chipLabel} variant="outlined" sx={{ height: 18, flexShrink: 0 }} />
    </Box>
  );
}

/**
 * Normalizes one settings-search query for case-insensitive matching.
 */
function normalizeSettingsSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Scores one result string by prefix-first matching and then by text position.
 */
function rankSettingsSearchResult(label: string, query: string): number {
  const normalizedLabel = normalizeSettingsSearchQuery(label);
  if (normalizedLabel.startsWith(query)) {
    return 0;
  }
  const firstMatchIndex = normalizedLabel.indexOf(query);
  if (firstMatchIndex >= 0) {
    return 100 + firstMatchIndex;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Renders the settings workspace with one dedicated left navigation and a center content area.
 */
export function SettingsView() {
  const { themePreference, setThemePreference } = useThemePreference();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const selectedTabParam = searchParams.get("tab");
  const focusedItemParam = searchParams.get("focus");
  const focusedNotificationItemId = isNotificationSettingsFocusItemId(focusedItemParam) ? focusedItemParam : undefined;
  const focusAiChatProviders = selectedTabParam === "agents" && focusedItemParam === "agentProviders";
  const shouldReserveMacWindowControlsInset = getRendererPlatform() === "darwin";

  const selectedTab = useMemo<SettingsTab>(() => {
    if (
      selectedTabParam === "account" ||
      selectedTabParam === "agents" ||
      selectedTabParam === "appearance" ||
      selectedTabParam === "computerUse" ||
      selectedTabParam === "daemon" ||
      selectedTabParam === "integrations" ||
      selectedTabParam === "keybindings" ||
      selectedTabParam === "language" ||
      selectedTabParam === "links" ||
      selectedTabParam === "members" ||
      selectedTabParam === "memory" ||
      selectedTabParam === "nodes" ||
      selectedTabParam === "notifications" ||
      selectedTabParam === "serviceTokens" ||
      selectedTabParam === "skills" ||
      selectedTabParam === "terminal" ||
      selectedTabParam === "workspace"
    ) {
      if (selectedTabParam === "language") {
        return "appearance";
      }
      return selectedTabParam;
    }
    return "account";
  }, [selectedTabParam]);

  const normalizedSearchQuery = useMemo(() => normalizeSettingsSearchQuery(searchQuery), [searchQuery]);

  const searchResults = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return SETTINGS_SEARCH_CATALOG.map<SettingsSearchResult | null>((item) => {
      const label = t(item.labelKey);
      const searchableText = [label, ...item.keywordKeys.map((keywordKey) => t(keywordKey))].join(" ");
      const rank = rankSettingsSearchResult(searchableText, normalizedSearchQuery);
      if (!Number.isFinite(rank)) {
        return null;
      }
      return {
        id: item.id,
        tab: item.tab,
        icon: item.icon,
        label,
        sectionLabel: t(item.sectionLabelKey),
        focusItemId: item.focusItemId,
        rank,
      };
    })
      .filter((result): result is SettingsSearchResult => result !== null)
      .sort((left, right) => left.rank - right.rank);
  }, [normalizedSearchQuery, t]);

  const selectedTabContentByTab = useMemo<Record<SettingsTab, ReactNode>>(
    () => ({
      notifications: <NotificationSettingsView focusItemId={focusedNotificationItemId} />,
      account: <AccountSettingsView />,
      agents: (
        <SettingsErrorBoundary sectionLabel={t("settings.agents.title")}>
          <AgentSettingsView focusAiChatProviders={focusAiChatProviders} />
        </SettingsErrorBoundary>
      ),
      computerUse: <ComputerUseSettingsView />,
      appearance: (
        <Stack spacing={2}>
          <ThemePreferencePicker
            preference={themePreference}
            onChange={setThemePreference}
            title={t("settings.appearance.theme.title")}
            description={t("settings.appearance.theme.description")}
            lightLabel={t("settings.appearance.theme.options.light")}
            darkLabel={t("settings.appearance.theme.options.dark")}
            systemLabel={t("settings.appearance.theme.options.system")}
          />
          <LanguageSettingsView />
          <MarkdownSettingsView />
        </Stack>
      ),
      daemon: <DaemonSettingsView />,
      integrations: (
        <SettingsErrorBoundary sectionLabel={t("settings.integrations.title")}>
          <IntegrationSettingsView />
        </SettingsErrorBoundary>
      ),
      links: <LinkSettingsView />,
      members: <MemberSettingsView />,
      nodes: <NodesSettingsView />,
      serviceTokens: <ServiceTokenSettingsView />,
      skills: <SkillsSettingsView />,
      terminal: <TerminalSettingsView />,
      keybindings: <KeybindingsSettingsView />,
      memory: <MemorySettingsView />,
      workspace: <WorkspaceSettingsView />,
    }),
    [focusAiChatProviders, focusedNotificationItemId, setThemePreference, t, themePreference],
  );

  return (
    <SettingsPageLayout
      sidebar={
        <>
          {/* ── Fixed header: window controls + title + search ── */}
          <Box sx={{ px: 1.25, pt: 1.5, pb: 0, flexShrink: 0 }}>
            <Box
              className="electron-webkit-app-region-drag"
              sx={{ px: 0, mb: 0.5, display: "flex", alignItems: "center" }}
            >
              {shouldReserveMacWindowControlsInset ? <Box sx={{ width: 72, flexShrink: 0 }} /> : null}
              <Box sx={{ flex: 1 }} />
              <Tooltip title={t("settings.back")} arrow>
                <IconButton
                  className="electron-webkit-app-region-no-drag"
                  size="small"
                  onClick={() => navigate("/")}
                  data-testid="settings-back-button"
                  aria-label={t("settings.back")}
                  sx={{ transform: "rotate(180deg)" }}
                >
                  <RxExit size={16} />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="body2" sx={{ px: 1, mb: 1.25, fontWeight: 700 }}>
              {t("settings.title")}
            </Typography>

            <SearchInput
              placeholder={t("settings.searchPlaceholder")}
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
              }}
            />
          </Box>

          {/* ── Scrollable nav list below search ── */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1.25, pb: 1.5 }}>
            {normalizedSearchQuery ? (
              <Box sx={{ mt: 1.5 }}>
                <List disablePadding>
                  {searchResults.map((result) => {
                    const Icon = result.icon;
                    const isSelected =
                      selectedTab === result.tab &&
                      (result.focusItemId === undefined || focusedItemParam === result.focusItemId);
                    return (
                      <ListItemButton
                        key={result.id}
                        selected={isSelected}
                        onClick={() => {
                          if (result.focusItemId) {
                            setSearchParams({
                              tab: result.tab,
                              focus: result.focusItemId,
                            });
                            return;
                          }
                          setSearchParams({ tab: result.tab });
                        }}
                        sx={{ borderRadius: 1, minHeight: 38 }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Icon size={16} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            result.tab === "computerUse"
                              ? renderExperimentalSidebarLabel(result.label, t("settings.computerUse.experimental"))
                              : renderSidebarLabel(result.label)
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary">
                              {result.sectionLabel}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
                {searchResults.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1.25 }}>
                    {t("settings.searchNoResults")}
                  </Typography>
                ) : null}
              </Box>
            ) : (
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                {SETTINGS_NAV_SECTIONS.map((section) => (
                  <Box key={section.titleKey}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ px: 1, textTransform: "uppercase", letterSpacing: "0.08em" }}
                    >
                      {t(section.titleKey)}
                    </Typography>
                    <List disablePadding sx={{ mt: 0.5 }}>
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <ListItemButton
                            key={item.tab}
                            selected={selectedTab === item.tab}
                            onClick={() => setSearchParams({ tab: item.tab })}
                            sx={{ borderRadius: 1, minHeight: 34 }}
                          >
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              <Icon size={16} />
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                item.tab === "computerUse"
                                  ? renderExperimentalSidebarLabel(
                                      t(item.labelKey),
                                      t("settings.computerUse.experimental"),
                                    )
                                  : renderSidebarLabel(t(item.labelKey))
                              }
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </>
      }
    >
      {selectedTabContentByTab[selectedTab] ?? (
        <Box>
          <SettingsSectionHeader title={t("settings.title")} description={t("settings.comingSoon")} />
        </Box>
      )}
    </SettingsPageLayout>
  );
}
