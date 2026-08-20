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
import type { TFunction } from "i18next";
import { RxExit } from "react-icons/rx";
import { SearchInput } from "../../../../ui/components/SearchInput";
import { type SettingsSearchResult, renderExperimentalSidebarLabel, renderSidebarLabel } from "./settingsSearch";
import type { SettingsTab } from "./settingsSearchCatalog";
import { SETTINGS_NAV_SECTIONS } from "./settingsSearchCatalog";

interface SettingsSidebarProps {
  readonly focusedItemParam: string | null;
  readonly isMacWindowControlsInsetReserved: boolean;
  readonly normalizedSearchQuery: string;
  readonly searchQuery: string;
  readonly searchResults: readonly SettingsSearchResult[];
  readonly selectedTab: SettingsTab;
  readonly t: TFunction;
  readonly onNavigateBack: () => void;
  readonly onSearchQueryChange: (value: string) => void;
  readonly onSelectSearchResult: (result: SettingsSearchResult) => void;
  readonly onSelectTab: (tab: SettingsTab) => void;
}

export function SettingsSidebar({
  focusedItemParam,
  isMacWindowControlsInsetReserved,
  normalizedSearchQuery,
  searchQuery,
  searchResults,
  selectedTab,
  t,
  onNavigateBack,
  onSearchQueryChange,
  onSelectSearchResult,
  onSelectTab,
}: SettingsSidebarProps) {
  return (
    <>
      <Box sx={{ px: 1.25, pt: 1.5, pb: 0, flexShrink: 0 }}>
        <Box className="electron-webkit-app-region-drag" sx={{ px: 0, mb: 0.5, display: "flex", alignItems: "center" }}>
          {isMacWindowControlsInsetReserved ? <Box sx={{ width: 72, flexShrink: 0 }} /> : null}
          <Box sx={{ flex: 1 }} />
          <Tooltip title={t("settings.back")}>
            <IconButton
              className="electron-webkit-app-region-no-drag"
              onClick={onNavigateBack}
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
        <SearchInput placeholder={t("settings.searchPlaceholder")} value={searchQuery} onChange={onSearchQueryChange} />
      </Box>

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
                    onClick={() => onSelectSearchResult(result)}
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
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {result.sectionLabel}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                );
              })}
            </List>
            {searchResults.length === 0 ? (
              <Typography variant="caption" sx={{ color: "text.secondary", px: 1.25 }}>
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
                  sx={{ color: "text.secondary", px: 1, textTransform: "uppercase", letterSpacing: "0.08em" }}
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
                        onClick={() => onSelectTab(item.tab)}
                        sx={{ borderRadius: 1, minHeight: 34 }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Icon size={16} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            item.tab === "computerUse"
                              ? renderExperimentalSidebarLabel(t(item.labelKey), t("settings.computerUse.experimental"))
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
  );
}
