import { MenuItem, Stack, Switch } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsCompactSelect,
  SettingsControlRow,
  SettingsSectionHeader,
} from "../../../components/settings";
import type {
  MarkdownPreviewFontSize,
  MarkdownPreviewWidth,
  MarkdownThemePreference,
} from "../state/displaySettingsStore";
import { displaySettingsStore } from "../state/displaySettingsStore";

/** Renders markdown editor preference controls. */
export function MarkdownSettingsView() {
  const { t } = useTranslation();
  const markdownThemePreference = displaySettingsStore((state) => state.markdownThemePreference);
  const markdownPreviewFontSize = displaySettingsStore((state) => state.markdownPreviewFontSize);
  const markdownPreviewWidth = displaySettingsStore((state) => state.markdownPreviewWidth);
  const isMarkdownOutlineVisible = displaySettingsStore((state) => state.isMarkdownOutlineVisible);

  return (
    <>
      <SettingsSectionHeader
        title={t("settings.appearance.markdown.title")}
        description={t("settings.appearance.markdown.description")}
      />
      <SettingsCard>
        <SettingsControlRow
          title={t("settings.appearance.markdown.theme.label")}
          description={t("settings.appearance.markdown.theme.description")}
          control={
            <SettingsCompactSelect
              width={240}
              value={markdownThemePreference}
              onChange={(event) => {
                displaySettingsStore
                  .getState()
                  .setMarkdownThemePreference(event.target.value as MarkdownThemePreference);
              }}
              slotProps={{
                input: {
                  "aria-label": t("settings.appearance.markdown.theme.label"),
                },
              }}
            >
              <MenuItem value="inherit">{t("settings.appearance.markdown.theme.options.inherit")}</MenuItem>
              <MenuItem value="light">{t("settings.appearance.markdown.theme.options.light")}</MenuItem>
              <MenuItem value="dark">{t("settings.appearance.markdown.theme.options.dark")}</MenuItem>
            </SettingsCompactSelect>
          }
        />
        <SettingsControlRow
          title={t("settings.appearance.markdown.previewFontSize.label")}
          description={t("settings.appearance.markdown.previewFontSize.description")}
          control={
            <SettingsCompactSelect
              width={240}
              value={markdownPreviewFontSize}
              onChange={(event) => {
                displaySettingsStore
                  .getState()
                  .setMarkdownPreviewFontSize(event.target.value as MarkdownPreviewFontSize);
              }}
              slotProps={{
                input: {
                  "aria-label": t("settings.appearance.markdown.previewFontSize.label"),
                },
              }}
            >
              <MenuItem value="small">{t("settings.appearance.markdown.previewFontSize.options.small")}</MenuItem>
              <MenuItem value="medium">{t("settings.appearance.markdown.previewFontSize.options.medium")}</MenuItem>
              <MenuItem value="large">{t("settings.appearance.markdown.previewFontSize.options.large")}</MenuItem>
            </SettingsCompactSelect>
          }
        />
        <SettingsControlRow
          title={t("settings.appearance.markdown.previewWidth.label")}
          description={t("settings.appearance.markdown.previewWidth.description")}
          control={
            <SettingsCompactSelect
              width={240}
              value={markdownPreviewWidth}
              onChange={(event) => {
                displaySettingsStore.getState().setMarkdownPreviewWidth(event.target.value as MarkdownPreviewWidth);
              }}
              slotProps={{
                input: {
                  "aria-label": t("settings.appearance.markdown.previewWidth.label"),
                },
              }}
            >
              <MenuItem value="readable">{t("settings.appearance.markdown.previewWidth.options.readable")}</MenuItem>
              <MenuItem value="full">{t("settings.appearance.markdown.previewWidth.options.full")}</MenuItem>
            </SettingsCompactSelect>
          }
        />
        <SettingsControlRow
          title={t("settings.appearance.markdown.outlineVisible.label")}
          description={t("settings.appearance.markdown.outlineVisible.description")}
          control={
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
              <Switch
                checked={isMarkdownOutlineVisible}
                onChange={(event) => {
                  displaySettingsStore.getState().setIsMarkdownOutlineVisible(event.target.checked);
                }}
                slotProps={{
                  input: {
                    "aria-label": t("settings.appearance.markdown.outlineVisible.label"),
                    role: "switch",
                  },
                }}
              />
            </Stack>
          }
        />
      </SettingsCard>
    </>
  );
}
