import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text, XStack, useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";

type ShellIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  hitSlop?: number;
  onPress: () => void;
  size?: number;
};

export function ShellIconButton({
  accessibilityLabel,
  children,
  disabled = false,
  hitSlop = 8,
  onPress,
  size = 36,
}: ShellIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderRadius: 999,
        height: size,
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        width: size,
      })}
    >
      {children}
    </Pressable>
  );
}

export function ShellActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: theme.color12.val,
        borderRadius: 14,
        justifyContent: "center",
        minHeight: 48,
        opacity: pressed ? 0.85 : 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
      })}
    >
      <Text color="$color1" fontSize="$4" fontWeight="700">
        {label}
      </Text>
    </Pressable>
  );
}

export function ShellTreeIconBadge({
  backgroundColor,
  children,
}: {
  backgroundColor?: string;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: backgroundColor ?? theme.gray2.val,
        borderRadius: 4,
        height: 20,
        justifyContent: "center",
        width: 20,
      }}
    >
      {children}
    </View>
  );
}

export function ShellTreeRow({
  children,
  indent = 0,
  minHeight = 30,
  paddingVertical = 4,
  selected = false,
}: {
  children: ReactNode;
  indent?: number;
  minHeight?: number;
  paddingVertical?: number;
  selected?: boolean;
}) {
  const theme = useTheme();

  return (
    <XStack
      style={{
        alignItems: "center",
        backgroundColor: selected ? theme.gray4.val : "transparent",
        borderRadius: 8,
        gap: 8,
        minHeight,
        paddingLeft: MOBILE_UI_TOKENS.pane.insetX + indent,
        paddingRight: MOBILE_UI_TOKENS.pane.insetX,
        paddingVertical,
      }}
    >
      {children}
    </XStack>
  );
}
