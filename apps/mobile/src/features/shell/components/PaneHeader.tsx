import { ChevronDown } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text, XStack, useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";

type PaneHeaderProps = {
  leadingIcon: ReactNode;
  title: string;
  typeLabel: string;
  trailing?: ReactNode;
  onPress?: (() => void) | null;
};

export function PaneHeader({ leadingIcon, onPress, title, trailing, typeLabel }: PaneHeaderProps) {
  const theme = useTheme();
  const expandIndicator = onPress ? <ChevronDown color="$gray11" size={16} /> : null;
  const content = (
    <XStack
      style={{
        alignItems: "center",
        borderBottomColor: theme.gray4.val,
        borderBottomWidth: 1,
        gap: 8,
        paddingBottom: 6,
        paddingTop: 2,
      }}
    >
      <XStack style={{ alignItems: "center", flex: 1, gap: 8, minWidth: 0 }}>
        {leadingIcon}
        <Text color="$gray11" fontSize="$2" fontWeight="700" lineHeight={16}>
          {typeLabel}
        </Text>
        <Text color="$gray11" fontSize="$4" lineHeight={22} numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
      </XStack>
      {trailing || expandIndicator ? (
        <XStack style={{ alignItems: "center", gap: 8 }}>
          {trailing}
          {expandIndicator}
        </XStack>
      ) : null}
    </XStack>
  );

  return (
    <View style={{ paddingHorizontal: MOBILE_UI_TOKENS.pane.headerX }}>
      {onPress ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
}
