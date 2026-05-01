import {
  Box,
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
import { SettingsSectionHeader } from "../components/settings";
import { ThemePreferencePicker } from "../components/settings/ThemePreferencePicker";
import { getRendererPlatform } from "../helpers/platform";
import { useThemePreference } from "../hooks/useThemePreference";
import { AccountSettingsView } from "./settings/AccountSettingsView";
import { AgentSettingsView } from "./settings/AgentSettingsView";
import { DaemonSettingsView } from "./settings/DaemonSettingsView";
import { GitWorkspaceSettingsView } from "./settings/GitWorkspaceSettingsView";
import { NotificationSettingsView } from "./settings/NotificationSettingsView";
import { TerminalSettingsView } from "./settings/TerminalSettingsView";
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
  focusItemId?: NotificationSettingsFocusItemId;
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
  const shouldReserveMacWindowControlsInset = getRendererPlatform() === "darwin";

  const selectedTab = useMemo<SettingsTab>(() => {
    if (
      selectedTabParam === "account" ||
      selectedTabParam === "agents" ||
      selectedTabParam === "appearance" ||
      selectedTabParam === "daemon" ||
      selectedTabParam === "notifications" ||
      selectedTabParam === "terminal" ||
      selectedTabParam === "workspace"
    ) {
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

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        minHeight: 0,
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          width: 240,
          minWidth: 240,
          borderRight: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          px: 1.25,
          py: 1.5,
          overflowY: "auto",
        }}
      >
        <Box className="electron-webkit-app-region-drag" sx={{ px: 1, mb: 0.5, display: "flex", alignItems: "center" }}>
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

        {normalizedSearchQuery ? (
          <Box sx={{ mt: 1.5 }}>
            <List disablePadding>
              {searchResults.map((result) => {
                const Icon = result.icon;
                const isSelected =
                  selectedTab === result.tab &&
                  (result.focusItemId === undefined || focusedNotificationItemId === result.focusItemId);
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
                      primary={renderSidebarLabel(result.label)}
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
                        <ListItemText primary={renderSidebarLabel(t(item.labelKey))} />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          px: 2.5,
          pb: 2.5,
          pt: shouldReserveMacWindowControlsInset ? 4.5 : 2.5,
          overflowY: "auto",
        }}
      >
        {selectedTab === "notifications" ? (
          <NotificationSettingsView focusItemId={focusedNotificationItemId} />
        ) : selectedTab === "account" ? (
          <AccountSettingsView />
        ) : selectedTab === "agents" ? (
          <AgentSettingsView />
        ) : selectedTab === "appearance" ? (
          <ThemePreferencePicker
            preference={themePreference}
            onChange={setThemePreference}
            title={t("settings.appearance.theme.title")}
            description={t("settings.appearance.theme.description")}
            lightLabel={t("settings.appearance.theme.options.light")}
            darkLabel={t("settings.appearance.theme.options.dark")}
            systemLabel={t("settings.appearance.theme.options.system")}
          />
        ) : selectedTab === "daemon" ? (
          <DaemonSettingsView />
        ) : selectedTab === "terminal" ? (
          <TerminalSettingsView />
        ) : selectedTab === "workspace" ? (
          <GitWorkspaceSettingsView />
        ) : (
          <Box>
            <SettingsSectionHeader title={t("settings.title")} description={t("settings.comingSoon")} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
