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
import {
  type NotificationSettingsFocusItemId,
  isNotificationSettingsFocusItemId,
} from "@renderer/domains/notification";
import { getRendererPlatform } from "@renderer/platform/platform";
import {
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { BiCog } from "react-icons/bi";
import { RxExit } from "react-icons/rx";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SearchInput } from "../../../../ui/components/SearchInput";
import { SettingsSectionHeader } from "../../../../ui/components/SettingsPrimitives";
import { useThemePreference } from "../../hooks/useThemePreference";
import { SettingsErrorBoundary } from "./SettingsErrorBoundary";
import { SettingsPageLayout } from "./SettingsPageLayout";
import { ThemePreferencePicker } from "./ThemePreferencePicker";
import {
  AccountSettingsView,
  AgentProviderSettingsView,
  CLISettingsView,
  ComputerUseSettingsView,
  CustomizeSettingsView,
  DaemonSettingsView,
  EditorSettingsView,
  KeybindingsSettingsView,
  LanguageSettingsView,
  LinkSettingsView,
  MarkdownSettingsView,
  MemberSettingsView,
  MemorySettingsView,
  NodesSettingsView,
  NotificationSettingsView,
  ServiceTokenSettingsView,
  TerminalSettingsView,
  WorkspaceSettingsView,
} from "./settingsLazyPages";
import {
  type SettingsSearchResult,
  normalizeSettingsSearchQuery,
  rankSettingsSearchResult,
  renderExperimentalSidebarLabel,
  renderSidebarLabel,
} from "./settingsSearch";
import {
  type CustomizeFocusItemId,
  SETTINGS_NAV_SECTIONS,
  SETTINGS_SEARCH_CATALOG,
  type SettingsSearchCatalogItem,
  type SettingsTab,
  isCustomizeFocusItemId,
} from "./settingsSearchCatalog";

export function SettingsView() {
  const { themePreference, setThemePreference } = useThemePreference();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const selectedTabParam = searchParams.get("tab");
  const focusedItemParam = searchParams.get("focus");
  const focusedNotificationItemId = isNotificationSettingsFocusItemId(focusedItemParam) ? focusedItemParam : undefined;
  const focusedCustomizeItem = isCustomizeFocusItemId(focusedItemParam) ? focusedItemParam : undefined;
  const shouldReserveMacWindowControlsInset = getRendererPlatform() === "darwin";

  const selectedTab = useMemo<SettingsTab>(() => {
    if (
      selectedTabParam === "account" ||
      selectedTabParam === "appearance" ||
      selectedTabParam === "cli" ||
      selectedTabParam === "computerUse" ||
      selectedTabParam === "customize" ||
      selectedTabParam === "daemon" ||
      selectedTabParam === "keybindings" ||
      selectedTabParam === "language" ||
      selectedTabParam === "links" ||
      selectedTabParam === "members" ||
      selectedTabParam === "memory" ||
      selectedTabParam === "nodes" ||
      selectedTabParam === "notifications" ||
      selectedTabParam === "providers" ||
      selectedTabParam === "serviceTokens" ||
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

  const [agentSearchEntries, setAgentSearchEntries] = useState<readonly SettingsSearchCatalogItem[]>(() => []);
  useEffect(() => {
    let alive = true;
    void import("./settingsSearchCatalogAgent")
      .then((module) => {
        if (alive) {
          setAgentSearchEntries(module.AGENT_SETTINGS_SEARCH_ENTRIES ?? []);
        }
      })
      .catch(() => {
        // The agent search entries are enhancement-only; a failed lazy load
        // must never break the settings shell.
      });
    return () => {
      alive = false;
    };
  }, []);

  const settingsSearchCatalog = useMemo(
    () => [...SETTINGS_SEARCH_CATALOG, ...agentSearchEntries],
    [agentSearchEntries],
  );

  const searchResults = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return settingsSearchCatalog
      .map<SettingsSearchResult | null>((item) => {
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
  }, [normalizedSearchQuery, settingsSearchCatalog, t]);

  const selectedTabContentByTab = useMemo<Record<SettingsTab, ReactNode>>(
    () => ({
      notifications: (
        <Suspense fallback={null}>
          <NotificationSettingsView focusItemId={focusedNotificationItemId} />
        </Suspense>
      ),
      account: (
        <Suspense fallback={null}>
          <AccountSettingsView />
        </Suspense>
      ),
      cli: (
        <SettingsErrorBoundary sectionLabel={t("settings.cli.title")}>
          <Suspense fallback={null}>
            <CLISettingsView />
          </Suspense>
        </SettingsErrorBoundary>
      ),
      computerUse: (
        <Suspense fallback={null}>
          <ComputerUseSettingsView />
        </Suspense>
      ),
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
          <Suspense fallback={null}>
            <LanguageSettingsView />
          </Suspense>
          <Suspense fallback={null}>
            <EditorSettingsView />
          </Suspense>
          <Suspense fallback={null}>
            <MarkdownSettingsView />
          </Suspense>
        </Stack>
      ),
      daemon: (
        <Suspense fallback={null}>
          <DaemonSettingsView />
        </Suspense>
      ),
      links: (
        <Suspense fallback={null}>
          <LinkSettingsView />
        </Suspense>
      ),
      members: (
        <Suspense fallback={null}>
          <MemberSettingsView />
        </Suspense>
      ),
      nodes: (
        <Suspense fallback={null}>
          <NodesSettingsView />
        </Suspense>
      ),
      providers: (
        <SettingsErrorBoundary sectionLabel={t("settings.providers.title")}>
          <Suspense fallback={null}>
            <AgentProviderSettingsView />
          </Suspense>
        </SettingsErrorBoundary>
      ),
      serviceTokens: (
        <Suspense fallback={null}>
          <ServiceTokenSettingsView />
        </Suspense>
      ),
      customize: (
        <Suspense fallback={null}>
          <CustomizeSettingsView focus={focusedCustomizeItem} />
        </Suspense>
      ),
      terminal: (
        <Suspense fallback={null}>
          <TerminalSettingsView />
        </Suspense>
      ),
      keybindings: <KeybindingsSettingsView />,
      memory: (
        <Suspense fallback={null}>
          <MemorySettingsView />
        </Suspense>
      ),
      workspace: (
        <Suspense fallback={null}>
          <WorkspaceSettingsView />
        </Suspense>
      ),
    }),
    [focusedNotificationItemId, focusedCustomizeItem, setThemePreference, t, themePreference],
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
              <Tooltip title={t("settings.back")}>
                <IconButton
                  className="electron-webkit-app-region-no-drag"
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
                      (result.focusItemId === undefined ||
                        (typeof result.focusItemId === "string" && focusedItemParam === result.focusItemId));
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
                            <Typography
                              variant="caption"
                              sx={{
                                color: "text.secondary",
                              }}
                            >
                              {result.sectionLabel}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
                {searchResults.length === 0 ? (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      px: 1.25,
                    }}
                  >
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
                      sx={{
                        color: "text.secondary",
                        px: 1,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
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
