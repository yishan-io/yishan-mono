import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text, useTheme } from "tamagui";

const NATIVE_TERMINAL_KEY_BUTTONS: Array<{
  id: string;
  input?: string;
  labelKey: string;
}> = [
  { id: "esc", input: "\u001b", labelKey: "shell.terminalKeyEsc" },
  { id: "tab", input: "\t", labelKey: "shell.terminalKeyTab" },
  { id: "ctrl-c", input: "\u0003", labelKey: "shell.terminalKeyCtrlC" },
  { id: "up", input: "\u001b[A", labelKey: "shell.terminalKeyUp" },
  { id: "down", input: "\u001b[B", labelKey: "shell.terminalKeyDown" },
  { id: "left", input: "\u001b[D", labelKey: "shell.terminalKeyLeft" },
  { id: "right", input: "\u001b[C", labelKey: "shell.terminalKeyRight" },
  { id: "enter", input: "\r", labelKey: "shell.terminalKeyEnter" },
  { id: "backspace", input: "\u007f", labelKey: "shell.terminalKeyBackspace" },
];

export function ShellNativeTerminalKeyBar({
  actions,
  disabled,
  fixedLeadingAction,
  getLabel,
  onFocusKeyboard,
  onPressKey,
  showTerminalKeys = true,
  showTopBorder = true,
}: {
  actions?: Array<{
    accessibilityLabel: string;
    icon?: ReactNode;
    id: string;
    keepKeyboardFocused?: boolean;
    label?: string;
    onPress: () => Promise<void> | void;
  }> | null;
  disabled: boolean;
  fixedLeadingAction?: {
    accessibilityLabel: string;
    icon?: ReactNode;
    keepKeyboardFocused?: boolean;
    onPress: () => Promise<void> | void;
  } | null;
  getLabel: (labelKey: string) => string;
  onFocusKeyboard: () => void;
  onPressKey: (input: string) => void;
  showTerminalKeys?: boolean;
  showTopBorder?: boolean;
}) {
  const theme = useTheme();
  const terminalActions = actions ?? [];

  const restoreKeyboardFocus = () => {
    requestAnimationFrame(() => {
      onFocusKeyboard();
    });
  };

  const handleActionPress = (callback: () => Promise<void> | void) => {
    if (disabled) {
      return;
    }

    void Promise.resolve(callback());
  };

  return (
    <View
      style={{
        backgroundColor: theme.background.val,
        borderTopColor: theme.gray5.val,
        borderTopWidth: showTopBorder ? 1 : 0,
        flexDirection: "row",
        gap: 8,
        paddingBottom: 8,
        paddingHorizontal: 12,
        paddingTop: 8,
      }}
    >
      {fixedLeadingAction ? (
        <View
          style={{
            alignItems: "center",
            alignSelf: "stretch",
            backgroundColor: theme.gray2.val,
            borderRadius: 12,
            justifyContent: "center",
            minWidth: 48,
            paddingHorizontal: 4,
          }}
        >
          <Pressable
            accessibilityLabel={fixedLeadingAction.accessibilityLabel}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => {
              handleActionPress(fixedLeadingAction.onPress);
              if (fixedLeadingAction.keepKeyboardFocused !== false) {
                restoreKeyboardFocus();
              }
            }}
            style={({ pressed }) => ({
              alignItems: "center",
              borderRadius: 999,
              height: 36,
              justifyContent: "center",
              opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
              width: 36,
            })}
          >
            {fixedLeadingAction.icon}
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{ gap: 8, paddingRight: 20 }}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {terminalActions.map((action) => (
          <Pressable
            key={action.id}
            accessibilityLabel={action.accessibilityLabel}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => {
              handleActionPress(action.onPress);
              if (action.keepKeyboardFocused !== false) {
                restoreKeyboardFocus();
              }
            }}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.gray2.val,
              borderColor: theme.gray5.val,
              borderRadius: 10,
              borderWidth: 1,
              flexDirection: action.label ? "row" : "column",
              gap: action.icon && action.label ? 6 : 0,
              height: 36,
              justifyContent: "center",
              minWidth: action.label ? 64 : 44,
              opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
              paddingHorizontal: action.label ? 12 : 10,
            })}
          >
            {action.icon}
            {action.label ? (
              <Text color="$gray11" fontSize="$3" fontWeight="600">
                {action.label}
              </Text>
            ) : null}
          </Pressable>
        ))}
        {showTerminalKeys
          ? NATIVE_TERMINAL_KEY_BUTTONS.map((button) => {
              const label = getLabel(button.labelKey);

              return (
                <Pressable
                  key={button.id}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => {
                    if (!disabled && button.input) {
                      onPressKey(button.input);
                      restoreKeyboardFocus();
                    }
                  }}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    backgroundColor: theme.gray2.val,
                    borderColor: theme.gray5.val,
                    borderRadius: 10,
                    borderWidth: 1,
                    height: 36,
                    justifyContent: "center",
                    minWidth: label.length > 2 ? 56 : 44,
                    opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
                    paddingHorizontal: 14,
                  })}
                >
                  <Text color="$gray11" fontSize="$3" fontWeight="600">
                    {label}
                  </Text>
                </Pressable>
              );
            })
          : null}
      </ScrollView>
    </View>
  );
}
