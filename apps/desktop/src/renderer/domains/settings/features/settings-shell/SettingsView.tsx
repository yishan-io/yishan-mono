import { Box, Stack } from "@mui/material";
import { isNotificationSettingsFocusItemId } from "@renderer/domains/notification";
import { getRendererPlatform } from "@renderer/platform/platform";
import { type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SettingsSectionHeader } from "../../../../ui/components/SettingsPrimitives";
import { useThemePreference } from "../../hooks/useThemePreference";
import { SettingsErrorBoundary } from "./SettingsErrorBoundary";
import { SettingsPageLayout } from "./SettingsPageLayout";
import { SettingsSidebar } from "./SettingsSidebar";
import { ThemePreferencePicker } from "./ThemePreferencePicker";
import {
  AccountSettingsView,
  AgentChatWidthSettingsView,
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
import { type SettingsSearchResult, normalizeSettingsSearchQuery, rankSettingsSearchResult } from "./settingsSearch";
import {
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
          <AgentChatWidthSettingsView />
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

  const handleNavigateBack = useCallback(() => navigate("/"), [navigate]);
  const handleSearchQueryChange = useCallback((value: string) => setSearchQuery(value), []);

  const handleSelectSearchResult = useCallback(
    (result: SettingsSearchResult) => {
      if (result.focusItemId) {
        setSearchParams({ tab: result.tab, focus: result.focusItemId });
        return;
      }
      setSearchParams({ tab: result.tab });
    },
    [setSearchParams],
  );

  const handleSelectTab = useCallback((tab: SettingsTab) => setSearchParams({ tab }), [setSearchParams]);

  return (
    <SettingsPageLayout
      sidebar={
        <SettingsSidebar
          focusedItemParam={focusedItemParam}
          isMacWindowControlsInsetReserved={shouldReserveMacWindowControlsInset}
          normalizedSearchQuery={normalizedSearchQuery}
          searchQuery={searchQuery}
          searchResults={searchResults}
          selectedTab={selectedTab}
          t={t}
          onNavigateBack={handleNavigateBack}
          onSearchQueryChange={handleSearchQueryChange}
          onSelectSearchResult={handleSelectSearchResult}
          onSelectTab={handleSelectTab}
        />
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
