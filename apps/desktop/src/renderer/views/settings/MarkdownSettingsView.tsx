import { MenuItem, Stack, Switch } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsCompactSelect,
  SettingsControlRow,
  SettingsSectionHeader,
} from "../../components/settings";
import {
  type MarkdownDefaultViewMode,
  type MarkdownPreviewFontSize,
  type MarkdownPreviewWidth,
  layoutStore,
} from "../../store/settings/layoutStore";

/** Renders markdown editor default view mode preference controls. */
export function MarkdownSettingsView() {
  const { t } = useTranslation();
  const markdownDefaultViewMode = layoutStore((state) => state.markdownDefaultViewMode);
  const setMarkdownDefaultViewMode = layoutStore((state) => state.setMarkdownDefaultViewMode);
  const markdownPreviewFontSize = layoutStore((state) => state.markdownPreviewFontSize);
  const setMarkdownPreviewFontSize = layoutStore((state) => state.setMarkdownPreviewFontSize);
  const markdownPreviewWidth = layoutStore((state) => state.markdownPreviewWidth);
  const setMarkdownPreviewWidth = layoutStore((state) => state.setMarkdownPreviewWidth);
  const isMarkdownOutlineVisible = layoutStore((state) => state.isMarkdownOutlineVisible);
  const setIsMarkdownOutlineVisible = layoutStore((state) => state.setIsMarkdownOutlineVisible);

  return (
    <>
      <SettingsSectionHeader
        title={t("settings.appearance.markdown.title")}
        description={t("settings.appearance.markdown.description")}
      />
      <SettingsCard>
        <SettingsControlRow
          title={t("settings.appearance.markdown.defaultViewMode.label")}
          description={t("settings.appearance.markdown.defaultViewMode.description")}
          control={
            <SettingsCompactSelect
              width={240}
              value={markdownDefaultViewMode}
              onChange={(event) => {
                setMarkdownDefaultViewMode(event.target.value as MarkdownDefaultViewMode);
              }}
              slotProps={{
                input: {
                  "aria-label": t("settings.appearance.markdown.defaultViewMode.label"),
                },
              }}
            >
              <MenuItem value="edit">{t("settings.appearance.markdown.defaultViewMode.options.edit")}</MenuItem>
              <MenuItem value="preview">{t("settings.appearance.markdown.defaultViewMode.options.preview")}</MenuItem>
              <MenuItem value="split">{t("settings.appearance.markdown.defaultViewMode.options.split")}</MenuItem>
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
                setMarkdownPreviewFontSize(event.target.value as MarkdownPreviewFontSize);
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
                setMarkdownPreviewWidth(event.target.value as MarkdownPreviewWidth);
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
                  setIsMarkdownOutlineVisible(event.target.checked);
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
