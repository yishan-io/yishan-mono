import { Keyboard as KeyboardIcon } from "@tamagui/lucide-icons";
import { useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

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
  disabled,
  onDismissKeyboard,
  onFocusKeyboard,
  onPressKey,
  keyboardVisible,
}: {
  disabled: boolean;
  keyboardVisible: boolean;
  onDismissKeyboard: () => void;
  onFocusKeyboard: () => void;
  onPressKey: (input: string) => void;
}) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const keyboardToggleLabel = keyboardVisible ? t("shell.terminalKeyHideKeyboard") : t("shell.terminalKeyShowKeyboard");
  const keyboardVisibleAtPressStartRef = useRef(false);

  return (
    <View
      style={{
        backgroundColor: theme.background.val,
        borderTopColor: theme.gray5.val,
        borderTopWidth: 1,
        paddingBottom: 12,
        paddingTop: 10,
      }}
    >
      <ScrollView
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingRight: 20 }}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel={keyboardToggleLabel}
          accessibilityRole="button"
          disabled={disabled}
          onPressIn={() => {
            keyboardVisibleAtPressStartRef.current = keyboardVisible;
            if (disabled || keyboardVisible) {
              return;
            }

            onFocusKeyboard();
          }}
          onPress={() => {
            if (disabled) {
              return;
            }

            if (!keyboardVisibleAtPressStartRef.current) {
              return;
            }

            if (keyboardVisible) {
              onDismissKeyboard();
              return;
            }
          }}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: keyboardVisible ? theme.gray4.val : theme.gray2.val,
            borderColor: theme.gray5.val,
            borderRadius: 10,
            borderWidth: 1,
            height: 36,
            justifyContent: "center",
            minWidth: 44,
            opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
            paddingHorizontal: 10,
          })}
        >
          <KeyboardIcon color="$gray11" size={18} />
        </Pressable>
        {NATIVE_TERMINAL_KEY_BUTTONS.map((button) => {
          const label = t(button.labelKey);

          return (
            <Pressable
              key={button.id}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => {
                if (!disabled && button.input) {
                  onPressKey(button.input);
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
        })}
      </ScrollView>
    </View>
  );
}
