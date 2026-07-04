import { useCallback, useEffect, useRef } from "react";
import { Platform, ScrollView, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";

import { PaneBody } from "@/components/ui/PaneBody";
import {
  buildNativeTerminalOutputSurfaceStyle,
  buildNativeTerminalScrollContentStyle,
  buildNativeTerminalTextStyle,
} from "../domain/shell-terminal-native-pane-domain";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";
import { ShellMessageTimeline } from "./ShellMessageTimeline";

type ShellTerminalNativePaneProps = {
  displayOutput: string;
  emptyDescription: string;
  emptyStatusLabel: string;
  messages: TerminalMessage[];
  selectedTerminal: TerminalItem;
};

/** Renders the native text-output terminal surface used when xterm is disabled. */
export function ShellTerminalNativePane({
  displayOutput,
  emptyDescription,
  emptyStatusLabel,
  messages,
  selectedTerminal,
}: ShellTerminalNativePaneProps) {
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ShellTerminalTextOutput
        emptyDescription={emptyDescription}
        emptyStatusLabel={emptyStatusLabel}
        output={displayOutput}
        selectedTerminal={selectedTerminal}
      />
      {messages.length > 0 ? (
        <PaneBody gap={12} style={{ flexGrow: 0, flexShrink: 0, paddingTop: 16 }}>
          <ShellMessageTimeline messages={messages} />
        </PaneBody>
      ) : null}
    </View>
  );
}

type ShellTerminalTextOutputProps = {
  emptyDescription: string;
  emptyStatusLabel: string;
  output: string;
  selectedTerminal: TerminalItem;
};

function ShellTerminalTextOutput({
  emptyDescription,
  emptyStatusLabel,
  output,
  selectedTerminal,
}: ShellTerminalTextOutputProps) {
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
      <ScrollView
        ref={scrollViewRef}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!shouldAutoScrollRef.current) {
            return;
          }

          shouldAutoScrollRef.current = false;
          scrollToLatestOutput();
        }}
        contentContainerStyle={buildNativeTerminalScrollContentStyle()}
        style={{ flex: 1 }}
      >
        {output ? (
          <Text color="$color12" style={buildNativeTerminalTextStyle(Platform.OS)}>
            {output}
          </Text>
        ) : (
          <YStack style={{ alignItems: "center", flex: 1, gap: 8, justifyContent: "center" }}>
            <XStack style={{ alignItems: "center", gap: 8 }}>
              <SessionStatusIndicator showSpinnerForActive status={selectedTerminal.status} />
              <Text color="$gray11" fontSize="$3" fontWeight="700">
                {emptyStatusLabel}
              </Text>
            </XStack>
            <Text color="$gray10" fontSize="$3" style={{ textAlign: "center" }}>
              {emptyDescription}
            </Text>
          </YStack>
        )}
      </ScrollView>
    </View>
  );
}
