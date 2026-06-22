import { Languages } from "@tamagui/lucide-icons";
import { Separator } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { LanguagePreference } from "@/features/me/me.types";
import { type SettingsSelectorOption, SettingsSelectorSheet } from "./SettingsSelectorSheet";

type SettingsLanguageSectionProps = {
  currentLanguage: LanguagePreference;
  onSelectLanguage: (language: LanguagePreference) => void;
  pending: boolean;
};

export function SettingsLanguageSection({ currentLanguage, onSelectLanguage, pending }: SettingsLanguageSectionProps) {
  const { t } = useAppLanguage();
  const languageOptions: SettingsSelectorOption<LanguagePreference>[] = [
    {
      value: "en",
      label: t("settings.languageOptionEnglish"),
    },
    {
      value: "zh",
      label: t("settings.languageOptionChinese"),
    },
  ];
  const selectedLabel =
    languageOptions.find((option) => option.value === currentLanguage)?.label ?? t("settings.languageOptionEnglish");

  return (
    <>
      <SettingsSelectorSheet
        leadingIcon={<Languages color="$color11" size={18} />}
        label={t("settings.languageTitle")}
        title={t("settings.languageSelectTitle")}
        selectedLabel={selectedLabel}
        selectedValue={currentLanguage}
        options={languageOptions}
        onSelect={onSelectLanguage}
        disabled={pending}
        helper={pending ? t("settings.languageSaving") : undefined}
      />
      <Separator />
    </>
  );
}
