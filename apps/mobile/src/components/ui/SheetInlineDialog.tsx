import type { PropsWithChildren } from "react";
import { Pressable, View } from "react-native";
import { YStack, useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "./ui-tokens";

type SheetInlineDialogProps = PropsWithChildren<{
  onClose: () => void;
}>;

export function SheetInlineDialog({ children, onClose }: SheetInlineDialogProps) {
  const theme = useTheme();

  return (
    <View
      pointerEvents="box-none"
      style={{
        alignItems: "center",
        bottom: 0,
        justifyContent: "center",
        left: 0,
        position: "absolute",
        right: 0,
        top: 0,
      }}
    >
      <Pressable
        onPress={onClose}
        style={{
          bottom: 0,
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />
      <YStack
        style={{
          backgroundColor: theme.background.val,
          borderColor: theme.gray5.val,
          borderRadius: MOBILE_UI_TOKENS.radius.dialog,
          borderWidth: 1,
          gap: 12,
          padding: MOBILE_UI_TOKENS.sheet.dialogPadding,
          width: MOBILE_UI_TOKENS.sheet.cardWidth,
        }}
      >
        {children}
      </YStack>
    </View>
  );
}
