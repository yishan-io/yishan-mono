import { Alert, Box, Stack, Switch, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { workspaceSettingsStore } from "../../store/settings/workspaceSettingsStore";
import { GitWorkspaceSettingsView } from "./GitWorkspaceSettingsView";

/** Renders workspace-level preferences and workspace creation defaults. */
export function WorkspaceSettingsView() {
  const { t } = useTranslation();
  const isDefaultContextEnabled = workspaceSettingsStore((state) => state.isDefaultContextEnabled);
  const setDefaultContextEnabled = workspaceSettingsStore((state) => state.setDefaultContextEnabled);
  const [hasHydrated, setHasHydrated] = useState(() => workspaceSettingsStore.persist.hasHydrated());
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated) {
      return;
    }

    return workspaceSettingsStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
  }, [hasHydrated]);

  const handleDefaultContextChange = (nextChecked: boolean) => {
    try {
      setDefaultContextEnabled(nextChecked);
      setSaveError(null);
    } catch (error) {
      console.error("Failed to save workspace default context preference", error);
      setSaveError(getErrorMessage(error));
    }
  };

  const defaultContextStatus = isDefaultContextEnabled
    ? t("settings.workspace.defaultContext.status.enabled")
    : t("settings.workspace.defaultContext.status.disabled");

  return (
    <Stack spacing={2} data-testid="workspace-settings-panel">
      <Box>
        <SettingsSectionHeader
          title={t("settings.workspace.title")}
          description={t("settings.workspace.description")}
        />
        <SettingsCard>
          <SettingsRows>
            <SettingsControlRow
              title={t("settings.workspace.defaultContext.label")}
              description={t("settings.workspace.defaultContext.description")}
              control={
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
                  <Typography variant="caption" color="text.secondary">
                    {hasHydrated ? defaultContextStatus : t("settings.workspace.loading")}
                  </Typography>
                  <Switch
                    checked={isDefaultContextEnabled}
                    disabled={!hasHydrated}
                    onChange={(event) => handleDefaultContextChange(event.target.checked)}
                    slotProps={{
                      input: {
                        "aria-label": t("settings.workspace.defaultContext.label"),
                        role: "switch",
                      },
                    }}
                  />
                </Stack>
              }
            />
          </SettingsRows>
          {!hasHydrated ? (
            <Alert severity="info" sx={{ mt: 1 }}>
              {t("settings.workspace.loading")}
            </Alert>
          ) : null}
          {saveError ? (
            <Alert severity="error" sx={{ mt: 1 }}>
              {t("settings.workspace.errors.saveFailed", { message: saveError })}
            </Alert>
          ) : null}
        </SettingsCard>
      </Box>
      <GitWorkspaceSettingsView />
    </Stack>
  );
}
