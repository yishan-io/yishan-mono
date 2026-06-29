import { SquareTerminal } from "@tamagui/lucide-icons";
import { Separator } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { TerminalRendererPreference } from "@/lib/storage/terminal-renderer-preference-storage";
import { type SettingsSelectorOption, SettingsSelectorSheet } from "./SettingsSelectorSheet";

type SettingsTerminalRendererSectionProps = {
  onSelectRenderer: (preference: TerminalRendererPreference) => void;
  preference: TerminalRendererPreference;
};

export function SettingsTerminalRendererSection({
  onSelectRenderer,
  preference,
}: SettingsTerminalRendererSectionProps) {
  const { t } = useAppLanguage();
  const rendererOptions: SettingsSelectorOption<TerminalRendererPreference>[] = [
    {
      value: "native",
      label: t("settings.terminalRendererNative"),
      description: t("settings.terminalRendererNativeDescription"),
    },
    {
      value: "xterm",
      label: t("settings.terminalRendererXterm"),
      description: t("settings.terminalRendererXtermDescription"),
    },
  ];
  const selectedLabel =
    rendererOptions.find((option) => option.value === preference)?.label ?? t("settings.terminalRendererXterm");

  return (
    <>
      <SettingsSelectorSheet
        leadingIcon={<SquareTerminal color="$color11" size={18} />}
        label={t("settings.terminalRendererTitle")}
        title={t("settings.terminalRendererSelectTitle")}
        selectedLabel={selectedLabel}
        selectedValue={preference}
        options={rendererOptions}
        onSelect={onSelectRenderer}
      />
      <Separator />
    </>
  );
}
