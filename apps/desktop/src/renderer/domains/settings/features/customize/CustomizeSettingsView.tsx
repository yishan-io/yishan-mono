import { Box, Tab, Tabs } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsSectionHeader } from "../../ui/controls";
import { SkillsSettingsView } from "../agent-skills/SkillsSettingsView";
import type { CustomizeFocusItemId } from "../settings-shell/settingsSearchCatalog";
import { AgentsSettingsView } from "./AgentsSettingsView";
import { ExtensionsSettingsView } from "./ExtensionsSettingsView";

type CustomizeSettingsViewProps = {
  focus?: CustomizeFocusItemId;
};

/**
 * Renders the Customize settings tab: a segmented sub-nav over Extensions,
 * Skills, and Agents panels. The active panel can be deep-linked via the
 * focus query param (e.g. ?tab=customize&focus=extensions).
 */
export function CustomizeSettingsView({ focus }: CustomizeSettingsViewProps) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState<CustomizeFocusItemId>(focus ?? "extensions");

  useEffect(() => {
    setPanel(focus ?? "extensions");
  }, [focus]);

  return (
    <Box data-testid="customize-settings-panel">
      <SettingsSectionHeader title={t("settings.customize.title")} description={t("settings.customize.description")} />
      <Tabs
        value={panel}
        onChange={(_event, value: CustomizeFocusItemId) => {
          setPanel(value);
        }}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
        <Tab value="extensions" label={t("settings.customize.panels.extensions")} />
        <Tab value="skills" label={t("settings.customize.panels.skills")} />
        <Tab value="agents" label={t("settings.customize.panels.agents")} />
      </Tabs>
      {panel === "extensions" ? <ExtensionsSettingsView /> : null}
      {panel === "skills" ? <SkillsSettingsView /> : null}
      {panel === "agents" ? <AgentsSettingsView /> : null}
    </Box>
  );
}
