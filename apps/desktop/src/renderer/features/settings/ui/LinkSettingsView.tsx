import { MenuItem } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsCompactSelect,
  SettingsControlRow,
  SettingsSectionHeader,
} from "../../../components/settings";
import type { LinkTarget } from "../../../features/workbench";
import { setLinkTarget as applySetLinkTarget } from "../../../features/workbench/state/workbenchActions";
import { useLinkTarget } from "../../../features/workbench/ui/hooks/useWorkbenchLayout";

const LINK_TARGET_OPTIONS: LinkTarget[] = ["built-in", "external"];

export function LinkSettingsView() {
  const { t } = useTranslation();
  const linkTarget = useLinkTarget();
  const setLinkTarget = applySetLinkTarget;

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
                setLinkTarget(nextTarget);
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
