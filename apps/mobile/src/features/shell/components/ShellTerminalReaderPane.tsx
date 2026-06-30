import { ArrowLeft } from "@tamagui/lucide-icons";
import { useCallback, useEffect, useRef } from "react";
import { Platform, ScrollView, TextInput, View } from "react-native";
import { Text, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { TerminalItem } from "../state/shell.types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";
import { ShellNativeTerminalKeyBar } from "./ShellNativeTerminalKeyBar";
import {
  buildNativeTerminalOutputSurfaceStyle,
  buildNativeTerminalScrollContentStyle,
  buildNativeTerminalTextStyle,
} from "./shell-terminal-native-pane-domain";

type ShellTerminalReaderPaneProps = {
  emptyDescription: string;
  emptyStatusLabel: string;
  onExit: () => void;
  output: string;
  selectedTerminal: TerminalItem;
};

/** Renders one selectable reader-mode surface for terminal output. */
export function ShellTerminalReaderPane({
  emptyDescription,
  emptyStatusLabel,
  onExit,
  output,
  selectedTerminal,
}: ShellTerminalReaderPaneProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const shouldAutoScrollRef = useRef(false);

  const scrollToLatestOutput = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: false });
  }, []);

  useEffect(() => {
    if (!output) {
      return;
    }

    shouldAutoScrollRef.current = true;
  }, [output]);

  return (
    <View style={buildNativeTerminalOutputSurfaceStyle()}>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            buildNativeTerminalScrollContentStyle(),
            { paddingBottom: 16, paddingHorizontal: 12, paddingTop: 12 },
          ]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (!shouldAutoScrollRef.current) {
              return;
            }

            shouldAutoScrollRef.current = false;
            scrollToLatestOutput();
          }}
          style={{ flex: 1 }}
        >
          {output ? (
            <TextInput
              contextMenuHidden={false}
              multiline
              readOnly
              scrollEnabled={false}
              selectionColor={theme.color8.val}
              showSoftInputOnFocus={false}
              style={[
                buildNativeTerminalTextStyle(Platform.OS),
                {
                  color: theme.color12.val,
                  minHeight: 0,
                  paddingBottom: 0,
                  paddingHorizontal: 0,
                  paddingTop: 0,
                  textAlignVertical: "top",
                },
              ]}
              value={output}
            />
          ) : (
            <View style={{ alignItems: "center", flex: 1, gap: 8, justifyContent: "center" }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                <SessionStatusIndicator showSpinnerForActive status={selectedTerminal.status} />
                <Text color="$gray11" fontSize="$3" fontWeight="700">
                  {emptyStatusLabel}
                </Text>
              </View>
              <Text color="$gray10" fontSize="$3" style={{ textAlign: "center" }}>
                {emptyDescription}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
      <ShellNativeTerminalKeyBar
        actions={[
          {
            accessibilityLabel: t("shell.terminalReaderModeExit"),
            icon: <ArrowLeft color="$gray11" size={16} />,
            id: "exit-reader-mode",
            keepKeyboardFocused: false,
            label: t("shell.terminalReaderModeExit"),
            onPress: onExit,
          },
        ]}
        disabled={false}
        getLabel={(labelKey) => t(labelKey)}
        onFocusKeyboard={() => {}}
        onPressKey={() => {}}
        showTerminalKeys={false}
      />
    </View>
  );
}
