import { MenuItem } from "@mui/material";
import { useTranslation } from "react-i18next";
import { SettingsCompactSelect } from "../../../../ui/components/SettingsCompactControls";
import { SettingsCard, SettingsControlRow, SettingsSectionHeader } from "../../../../ui/components/SettingsPrimitives";
import type { LinkTarget } from "../../state/displaySettingsStore";
import { displaySettingsStore } from "../../state/displaySettingsStore";

const LINK_TARGET_OPTIONS: LinkTarget[] = ["built-in", "external"];

export function LinkSettingsView() {
  const { t } = useTranslation();
  const linkTarget = displaySettingsStore((state) => state.linkTarget);

  return (
    <>
      <SettingsSectionHeader title={t("settings.links.title")} description={t("settings.links.description")} />
      <SettingsCard>
        <SettingsControlRow
          title={t("settings.links.targetLabel")}
          control={
            <SettingsCompactSelect
              width={240}
              value={linkTarget}
              onChange={(event) => {
                const nextTarget = event.target.value as LinkTarget;
                if (nextTarget === linkTarget) {
                  return;
                }
                displaySettingsStore.getState().setLinkTarget(nextTarget);
              }}
              slotProps={{
                input: {
                  "aria-label": t("settings.links.targetLabel"),
                },
              }}
            >
              {LINK_TARGET_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {t(`settings.links.options.${option}`)}
                </MenuItem>
              ))}
            </SettingsCompactSelect>
          }
        />
      </SettingsCard>
    </>
  );
}
