import { Platform, ScrollView, View } from "react-native";
import { Text, XStack, YStack, useTheme } from "tamagui";

import { PaneBody } from "@/components/ui/PaneBody";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
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
    <PaneBody gap={12} style={{ flex: 1, paddingBottom: 16, paddingTop: 16 }}>
      <ShellTerminalTextOutput
        emptyDescription={emptyDescription}
        emptyStatusLabel={emptyStatusLabel}
        output={displayOutput}
        selectedTerminal={selectedTerminal}
      />
      {messages.length > 0 ? <ShellMessageTimeline messages={messages} /> : null}
    </PaneBody>
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
  const theme = useTheme();

  return (
    <View
      style={{
        borderColor: theme.gray5.val,
        borderRadius: MOBILE_UI_TOKENS.radius.surface,
        borderWidth: 1,
        flex: 1,
        overflow: "hidden",
      }}
    >
      <ScrollView
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 14, paddingVertical: 12 }}
        style={{ flex: 1 }}
      >
        {output ? (
          <Text
            color="$color12"
            fontSize={15}
            style={{
              fontFamily: Platform.select({ android: "monospace", default: "Menlo", ios: "Menlo" }),
              lineHeight: 20,
            }}
          >
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
