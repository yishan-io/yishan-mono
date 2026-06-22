import { Pressable, View } from "react-native";
import { Text, XStack, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

type WorkspaceBrowserTabsProps = {
  activeTab: "files" | "changes" | "prs";
  onSelectTab: (tab: "files" | "changes" | "prs") => void;
};

export function WorkspaceBrowserTabs({ activeTab, onSelectTab }: WorkspaceBrowserTabsProps) {
  const theme = useTheme();
  const { t } = useAppLanguage();

  return (
    <XStack
      style={{
        alignItems: "center",
        backgroundColor: theme.gray2.val,
        borderRadius: 12,
        gap: 8,
        padding: 4,
      }}
    >
      {(
        [
          ["files", t("shell.files")],
          ["changes", t("shell.changes")],
          ["prs", t("shell.pullRequests")],
        ] as const
      ).map(([tab, label]) => {
        const selected = activeTab === tab;

        return (
          <Pressable
            key={tab}
            onPress={() => onSelectTab(tab)}
            style={{
              flexBasis: 0,
              flexGrow: 1,
              flexShrink: 1,
            }}
          >
            <View
              style={{
                alignItems: "center",
                backgroundColor: selected ? theme.background.val : "transparent",
                borderRadius: 10,
                justifyContent: "center",
                minHeight: 40,
              }}
            >
              <Text color={selected ? undefined : "$gray11"} fontSize="$4" fontWeight={selected ? "700" : "600"}>
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </XStack>
  );
}
