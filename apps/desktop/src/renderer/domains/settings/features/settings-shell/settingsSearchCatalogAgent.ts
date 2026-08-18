import {
  AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION,
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "@renderer/domains/agent";
import { BiBot } from "react-icons/bi";
import type { SettingsSearchCatalogItem } from "./settingsSearchCatalog";

/**
 * Agent-kind settings search entries (desktop7 Phase 22).
 *
 * Split out of `settingsSearchCatalog` and loaded lazily by the Settings shell
 * so the Settings index never evaluates the Agent index at module-load time
 * (the Agent index re-imports the Settings index through Agent features; a
 * module-load cycle breaks mocked test graphs).
 */
export const AGENT_SETTINGS_SEARCH_ENTRIES: SettingsSearchCatalogItem[] = SUPPORTED_DESKTOP_AGENT_KINDS.filter(
  (agentKind) => !AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION.has(agentKind),
).map((agentKind) => ({
  id: `cli-agent-${agentKind}`,
  tab: "cli" as const,
  icon: BiBot,
  labelKey: AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind],
  sectionLabelKey: "settings.items.cli",
  keywordKeys: ["settings.agents.inUse", "settings.agents.status.detected", "settings.agents.status.notDetected"],
}));
