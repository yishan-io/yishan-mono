import { ArrowLeft } from "@tamagui/lucide-icons";
import { useCallback, useEffect, useRef } from "react";
import { Text as NativeText, Platform, ScrollView, View } from "react-native";
import { Text, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import {
  buildNativeTerminalOutputSurfaceStyle,
  buildNativeTerminalScrollContentStyle,
  buildNativeTerminalTextStyle,
} from "../domain/shell-terminal-native-pane-domain";
import type { TerminalItem } from "../state/shell.types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";
import { ShellNativeTerminalKeyBar } from "./ShellNativeTerminalKeyBar";

const NATIVE_TERMINAL_READER_BOTTOM_THRESHOLD = 24;

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
  const contentHeightRef = useRef(0);
  const readerViewportHeightRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);

  const scrollToLatestOutput = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: false });
  }, []);

  useEffect(() => {
    if (!output) {
      return;
    }

    if (shouldAutoScrollRef.current) {
      scrollToLatestOutput();
    }
  }, [output, scrollToLatestOutput]);

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
          onContentSizeChange={(_, contentHeight) => {
            contentHeightRef.current = contentHeight;
            if (shouldAutoScrollRef.current) {
              scrollToLatestOutput();
            }
          }}
          onLayout={(event) => {
            readerViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          onScroll={(event) => {
            const nextOffsetY = event.nativeEvent.contentOffset.y;
            const remainingDistance = contentHeightRef.current - (nextOffsetY + readerViewportHeightRef.current);
            shouldAutoScrollRef.current = remainingDistance <= NATIVE_TERMINAL_READER_BOTTOM_THRESHOLD;
          }}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {output ? (
            <NativeText
              selectable
              selectionColor={theme.color8.val}
              style={[
                buildNativeTerminalTextStyle(Platform.OS),
                {
                  color: theme.color12.val,
                  minHeight: 0,
                },
              ]}
            >
              {output}
            </NativeText>
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
