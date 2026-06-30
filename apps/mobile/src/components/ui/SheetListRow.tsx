import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text, XStack, YStack, useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "./ui-tokens";

type SheetListRowProps = {
  active?: boolean;
  activeStyle?: "card" | "row";
  description?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  minHeight?: number;
  onPress?: () => void;
  title: ReactNode;
  titleWeight?: "500" | "600" | "700";
  trailing?: ReactNode;
};

/** Owns the shared interactive row shell used by sheets and list-like cards. */
export function SheetListRow({
  active = false,
  activeStyle = "card",
  description,
  leading,
  meta,
  minHeight = 64,
  onPress,
  title,
  titleWeight = "600",
  trailing,
}: SheetListRowProps) {
  const theme = useTheme();
  const isRowActiveStyle = activeStyle === "row";

  const content = (
    <XStack
      style={{
        alignItems: "stretch",
        backgroundColor: active ? theme.gray2.val : "transparent",
        borderRadius: active && isRowActiveStyle ? 0 : MOBILE_UI_TOKENS.radius.row,
        gap: MOBILE_UI_TOKENS.sheet.itemGap,
        justifyContent: "space-between",
        minHeight,
        paddingHorizontal: MOBILE_UI_TOKENS.sheet.rowInsetX,
        paddingVertical: MOBILE_UI_TOKENS.sheet.rowInsetY,
      }}
    >
      <YStack style={{ flex: 1, gap: 6, justifyContent: "center", minWidth: 0 }}>
        {leading || meta ? (
          <XStack style={{ alignItems: "center", gap: 8, minWidth: 0 }}>
            {leading}
            {typeof meta === "string" ? (
              <Text color="$gray11" fontSize="$2" fontWeight="700" lineHeight={16} numberOfLines={1}>
                {meta}
              </Text>
            ) : (
              meta
            )}
          </XStack>
        ) : null}
        {typeof title === "string" ? (
          <Text fontSize="$5" fontWeight={titleWeight} lineHeight={20} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
        {description ? <View>{description}</View> : null}
      </YStack>
      {trailing ? <View style={{ alignSelf: "center" }}>{trailing}</View> : null}
    </XStack>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} style={{ minWidth: 0 }}>
      {content}
    </Pressable>
  );
}
