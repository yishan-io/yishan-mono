import { ChevronDown } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { Text, XStack } from "tamagui";

import { WorkbenchSecondaryBarFrame } from "@/components/screens/WorkbenchSecondaryBarFrame";

type PaneHeaderProps = {
  leadingIcon: ReactNode;
  title: string;
  typeLabel: string;
  trailing?: ReactNode;
  onPress?: (() => void) | null;
};

export function PaneHeader({ leadingIcon, onPress, title, trailing, typeLabel }: PaneHeaderProps) {
  const expandIndicator = onPress ? <ChevronDown color="$gray11" size={16} /> : null;
  const content = (
    <XStack
      style={{
        alignItems: "center",
        gap: 8,
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
    <WorkbenchSecondaryBarFrame showBottomShadow>
      {onPress ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        content
      )}
    </WorkbenchSecondaryBarFrame>
  );
}
