import { Check, ChevronDown } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { Button, Paragraph, Text, XStack, YStack } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import { SheetListRow } from "@/components/ui/SheetListRow";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

export type SettingsSelectorOption<TValue extends string> = {
  label: string;
  value: TValue;
  description?: string;
};

type SettingsSelectorSheetProps<TValue extends string> = {
  leadingIcon?: ReactNode;
  label: string;
  title: string;
  selectedLabel: string;
  selectedValue: TValue;
  options: SettingsSelectorOption<TValue>[];
  onSelect: (value: TValue) => void;
  disabled?: boolean;
  helper?: ReactNode;
};

export function SettingsSelectorSheet<TValue extends string>({
  disabled,
  helper,
  leadingIcon,
  label,
  onSelect,
  options,
  selectedLabel,
  selectedValue,
  title,
}: SettingsSelectorSheetProps<TValue>) {
  const { t } = useAppLanguage();
  const [open, setOpen] = useState(false);

  return (
    <>
      <YStack style={[styles.field, disabled ? styles.triggerDisabled : null]}>
        <SheetListRow
          description={typeof helper === "string" ? <Paragraph>{helper}</Paragraph> : helper}
          minHeight={56}
          onPress={disabled ? undefined : () => setOpen(true)}
          title={leadingIcon ? <SettingsListTitle icon={leadingIcon} label={label} /> : label}
          titleWeight={leadingIcon ? undefined : "600"}
          trailing={
            <XStack style={styles.triggerValue}>
              <Text fontSize="$5">{selectedLabel}</Text>
              <ChevronDown size={16} />
            </XStack>
          }
        />
      </YStack>

      <AppModalSheet open={open} onClose={() => setOpen(false)} position="center">
        <YStack style={styles.sheetHeader}>
          <Text fontSize="$8" fontWeight="800">
            {title}
          </Text>
        </YStack>

        <YStack style={styles.optionList}>
          {options.map((option) => {
            const selected = option.value === selectedValue;

            return (
              <SheetListRow
                active={selected}
                description={option.description ? <Paragraph>{option.description}</Paragraph> : undefined}
                key={option.value}
                onPress={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
                title={option.label}
                titleWeight={selected ? "700" : "500"}
                trailing={selected ? <Check size={18} /> : null}
              />
            );
          })}
        </YStack>

        <Button themeInverse onPress={() => setOpen(false)}>
          {t("common.done")}
        </Button>
      </AppModalSheet>
    </>
  );
}

function SettingsListTitle({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <XStack style={styles.titleRow}>
      <YStack style={styles.iconSlot}>{icon}</YStack>
      <Text fontSize="$5" fontWeight="600" numberOfLines={1}>
        {label}
      </Text>
    </XStack>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 0,
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
    width: 20,
  },
  optionList: {
    gap: 8,
  },
  sheetHeader: {
    gap: 4,
  },
  triggerDisabled: {
    opacity: 0.6,
  },
  triggerValue: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginLeft: 12,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minWidth: 0,
  },
});
