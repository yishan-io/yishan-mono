import { MenuItem, Stack, Switch } from "@mui/material";
import { TYPOGRAPHY_TOKENS } from "@yishan-io/design-tokens";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsCompactSelect,
  SettingsControlRow,
  SettingsSectionHeader,
} from "../../components/settings";
import { CODE_THEME_FAMILIES, type CodeThemeFamilyId } from "../../helpers/codeThemes";
import { editorSettingsStore } from "../../store/settings/editorSettingsStore";

const FONT_SIZE_OPTIONS: number[] = Array.from(
  { length: TYPOGRAPHY_TOKENS.editorFontSizeMaxPx - TYPOGRAPHY_TOKENS.editorFontSizeMinPx + 1 },
  (_, i) => TYPOGRAPHY_TOKENS.editorFontSizeMinPx + i,
);

/** Renders editor code display preference controls. */
export function EditorSettingsView() {
  const { t } = useTranslation();
  const codeThemePreference = editorSettingsStore((state) => state.codeThemePreference);
  const setCodeThemePreference = editorSettingsStore((state) => state.setCodeThemePreference);
  const editorFontSize = editorSettingsStore((state) => state.editorFontSize);
  const setEditorFontSize = editorSettingsStore((state) => state.setEditorFontSize);
  const wordWrap = editorSettingsStore((state) => state.wordWrap);
  const setWordWrap = editorSettingsStore((state) => state.setWordWrap);

  return (
    <>
      <SettingsSectionHeader
        title={t("settings.appearance.editor.title")}
        description={t("settings.appearance.editor.description")}
      />
      <SettingsCard>
        <SettingsControlRow
          title={t("settings.appearance.editor.theme.label")}
          description={t("settings.appearance.editor.theme.description")}
          control={
            <SettingsCompactSelect
              width={240}
              value={codeThemePreference}
              onChange={(event) => {
                setCodeThemePreference(event.target.value as CodeThemeFamilyId);
              }}
              slotProps={{
                input: {
                  "aria-label": t("settings.appearance.editor.theme.label"),
                },
              }}
            >
              {CODE_THEME_FAMILIES.map((family) => (
                <MenuItem key={family.id} value={family.id}>
                  {family.label}
                </MenuItem>
              ))}
            </SettingsCompactSelect>
          }
        />
        <SettingsControlRow
          title={t("settings.appearance.editor.fontSize.label")}
          description={t("settings.appearance.editor.fontSize.description")}
          control={
            <SettingsCompactSelect
              width={240}
              value={String(editorFontSize)}
              onChange={(event) => {
                setEditorFontSize(Number(event.target.value));
              }}
              slotProps={{
                input: {
                  "aria-label": t("settings.appearance.editor.fontSize.label"),
                },
              }}
            >
              {FONT_SIZE_OPTIONS.map((size) => (
                <MenuItem key={size} value={String(size)}>
                  {size}
                </MenuItem>
              ))}
            </SettingsCompactSelect>
          }
        />
        <SettingsControlRow
          title={t("settings.appearance.editor.wordWrap.label")}
          description={t("settings.appearance.editor.wordWrap.description")}
          control={
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
              <Switch
                checked={wordWrap}
                onChange={(event) => {
                  setWordWrap(event.target.checked);
                }}
                slotProps={{
                  input: {
                    "aria-label": t("settings.appearance.editor.wordWrap.label"),
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
