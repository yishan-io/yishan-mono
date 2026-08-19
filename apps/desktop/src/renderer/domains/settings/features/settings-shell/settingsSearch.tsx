import { Box, Chip, Typography } from "@mui/material";
import type { NotificationSettingsFocusItemId } from "@renderer/domains/notification";
import type { ReactNode } from "react";
import type { BiCog } from "react-icons/bi";
import type { CustomizeFocusItemId } from "./settingsSearchCatalog";
import type { SettingsTab } from "./settingsSearchCatalog";

/**
 * Settings search helpers (desktop8 Phase 33: split from SettingsView.tsx).
 */

export type SettingsSearchResult = {
  id: string;
  tab: SettingsTab;
  icon: typeof BiCog;
  label: string;
  sectionLabel: string;
  focusItemId?: NotificationSettingsFocusItemId | CustomizeFocusItemId;
  rank: number;
};

/**
 * Wraps one menu label in standardized body2 typography used across workspace sidebars.
 */
export function renderSidebarLabel(label: ReactNode) {
  return (
    <Typography variant="body2" sx={{ lineHeight: 1.35 }}>
      {label}
    </Typography>
  );
}

export function renderExperimentalSidebarLabel(label: string, chipLabel: string) {
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
export function normalizeSettingsSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Scores one result string by prefix-first matching and then by text position.
 */
export function rankSettingsSearchResult(label: string, query: string): number {
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
