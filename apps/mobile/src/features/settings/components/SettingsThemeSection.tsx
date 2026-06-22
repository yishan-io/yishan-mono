import { Palette } from "@tamagui/lucide-icons";
import { Separator } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { ThemePreference } from "@/lib/storage/theme-preference-storage";
import { type SettingsSelectorOption, SettingsSelectorSheet } from "./SettingsSelectorSheet";

type SettingsThemeSectionProps = {
  preference: ThemePreference;
  onSelectTheme: (preference: ThemePreference) => void;
};

export function SettingsThemeSection({ onSelectTheme, preference }: SettingsThemeSectionProps) {
  const { t } = useAppLanguage();
  const themeOptions: SettingsSelectorOption<ThemePreference>[] = [
    {
      value: "system",
      label: t("settings.themeSystem"),
    },
    {
      value: "light",
      label: t("settings.themeLight"),
    },
    {
      value: "dark",
      label: t("settings.themeDark"),
    },
  ];
  const selectedLabel = themeOptions.find((option) => option.value === preference)?.label ?? t("settings.themeSystem");

  return (
    <>
      <SettingsSelectorSheet
        leadingIcon={<Palette color="$color11" size={18} />}
        label={t("settings.themeTitle")}
        title={t("settings.themeSelectTitle")}
        selectedLabel={selectedLabel}
        selectedValue={preference}
        options={themeOptions}
        onSelect={onSelectTheme}
      />
      <Separator />
    </>
  );
}
