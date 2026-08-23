import { MenuItem, type SelectChangeEvent } from "@mui/material";
import { useTranslation } from "react-i18next";
import { SettingsCompactSelect } from "../../../../ui/components/SettingsCompactControls";
import { SettingsCard, SettingsControlRow, SettingsSectionHeader } from "../../../../ui/components/SettingsPrimitives";
import { setAgentChatWidth } from "../../commands/settingsCommands";
import type { AgentChatWidth } from "../../state/displaySettingsStore";
import { displaySettingsStore } from "../../state/displaySettingsStore";

function isAgentChatWidth(value: string): value is AgentChatWidth {
  return value === "fixed" || value === "full";
}

function handleAgentChatWidthChange(event: SelectChangeEvent<string>) {
  const nextWidth = event.target.value;
  if (isAgentChatWidth(nextWidth)) {
    setAgentChatWidth(nextWidth);
  }
}

/** Renders the preferred content width control for agent chat. */
export function AgentChatWidthSettingsView() {
  const { t } = useTranslation();
  const agentChatWidth = displaySettingsStore((state) => state.agentChatWidth);

  return (
    <>
      <SettingsSectionHeader
        title={t("settings.appearance.agentChat.title")}
        description={t("settings.appearance.agentChat.description")}
      />
      <SettingsCard>
        <SettingsControlRow
          title={t("settings.appearance.agentChat.width.label")}
          description={t("settings.appearance.agentChat.width.description")}
          control={
            <SettingsCompactSelect
              width={240}
              value={agentChatWidth}
              onChange={handleAgentChatWidthChange}
              slotProps={{
                input: {
                  "aria-label": t("settings.appearance.agentChat.width.label"),
                },
              }}
            >
              <MenuItem value="fixed">{t("settings.appearance.agentChat.width.options.fixed")}</MenuItem>
              <MenuItem value="full">{t("settings.appearance.agentChat.width.options.full")}</MenuItem>
            </SettingsCompactSelect>
          }
        />
      </SettingsCard>
    </>
  );
}
