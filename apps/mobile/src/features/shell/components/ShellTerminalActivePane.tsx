import type { ITheme } from "@xterm/xterm";
import type { DOMProps } from "expo/dom";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Text, XStack, YStack, useTheme } from "tamagui";

import { PaneBody } from "@/components/ui/PaneBody";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { getTerminalStatusLabel } from "@/features/shell/view-model/shell-labels";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";
import { ShellMessageTimeline } from "./ShellMessageTimeline";
import { ShellNativeTerminalKeyBar } from "./ShellNativeTerminalKeyBar";
import ShellTerminalDomEmulator, { type ShellTerminalDomEmulatorHandle } from "./ShellTerminalDomEmulator";
import { getTerminalAccessoryBottomInset } from "./shell-terminal-active-pane-domain";

const NATIVE_KEYBOARD_INPUT_STYLE = {
  fontSize: 16,
  height: 1,
  left: 0,
  opacity: 0.01,
  position: "absolute" as const,
  top: 0,
  width: 1,
  zIndex: 1,
};

type ShellTerminalActivePaneProps = {
  blurRequestToken: number;
  displayOutput: string;
  emptyDescription: string;
  emptyStatusLabel: string;
  isComposerDisabled: boolean;
  keyboardVisible: boolean;
  keyboardViewportInset: number;
  messages: TerminalMessage[];
  onDismissKeyboard: () => void;
  onTerminalInput: (data: string) => void;
  onTerminalResize: (size: { cols: number; rows: number }) => void;
  resizeRequestToken: number;
  scrollbarThumbColor: string;
  selectedTerminal: TerminalItem;
  streamKey: string;
  terminalDomProps?: DOMProps;
  terminalOutput: string;
  terminalTheme: ITheme;
  usesTerminalEmulator: boolean;
};

export function ShellTerminalActivePane({
  blurRequestToken,
  displayOutput,
  emptyDescription,
  emptyStatusLabel,
  isComposerDisabled,
  keyboardVisible,
  keyboardViewportInset,
  messages,
  onDismissKeyboard,
  onTerminalInput,
  onTerminalResize,
  resizeRequestToken,
  scrollbarThumbColor,
  selectedTerminal,
  streamKey,
  terminalDomProps,
  terminalOutput,
  terminalTheme,
  usesTerminalEmulator,
}: ShellTerminalActivePaneProps) {
  const showNativeTerminalKeyBar = usesTerminalEmulator && Platform.OS !== "web";
  const accessoryBottomInset = getTerminalAccessoryBottomInset(keyboardViewportInset);
  const nativeKeyboardInputRef = useRef<TextInput | null>(null);
  const nativeKeyboardInputValueRef = useRef("");
  const terminalDomRef = useRef<ShellTerminalDomEmulatorHandle | null>(null);
  const [nativeKeyboardInputValue, setNativeKeyboardInputValue] = useState("");

  const focusNativeKeyboardInput = () => {
    nativeKeyboardInputValueRef.current = "";
    setNativeKeyboardInputValue("");
    nativeKeyboardInputRef.current?.focus();
  };

  const dismissTerminalKeyboard = () => {
    nativeKeyboardInputValueRef.current = "";
    setNativeKeyboardInputValue("");
    nativeKeyboardInputRef.current?.blur();
    terminalDomRef.current?.blurInputSession();
    onDismissKeyboard();
  };

  const resetNativeKeyboardInput = () => {
    nativeKeyboardInputValueRef.current = "";
    setNativeKeyboardInputValue("");
  };

  useEffect(() => {
    if (!keyboardVisible) {
      nativeKeyboardInputRef.current?.blur();
    }
  }, [keyboardVisible]);

  if (usesTerminalEmulator) {
    const showTimeline = messages.length > 0;

    return (
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ flex: 1, minHeight: 0 }}>
          <ShellTerminalDomEmulator
            blurRequestToken={blurRequestToken}
            dom={terminalDomProps}
            ref={terminalDomRef}
            onInput={async (data) => onTerminalInput(data)}
            onTapDismissKeyboard={dismissTerminalKeyboard}
            onResize={async (size) => onTerminalResize(size)}
            output={terminalOutput}
            resizeRequestToken={resizeRequestToken}
            scrollbarThumbColor={scrollbarThumbColor}
            streamKey={streamKey}
            terminalId={selectedTerminal.id}
            terminalTheme={terminalTheme}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            caretHidden
            contextMenuHidden
            onChangeText={(nextValue) => {
              const containsLineBreak = /[\r\n]/.test(nextValue);
              const currentValue = nativeKeyboardInputValueRef.current;
              const nextValueWithoutNewlines = nextValue.replace(/\r?\n/g, "");
              let insertedText = "";

              if (nextValueWithoutNewlines.startsWith(currentValue)) {
                insertedText = nextValueWithoutNewlines.slice(currentValue.length);
              } else if (!currentValue) {
                insertedText = nextValueWithoutNewlines;
              }

              if (insertedText) {
                onTerminalInput(insertedText);
              }

              if (containsLineBreak) {
                onTerminalInput("\r");
              }

              resetNativeKeyboardInput();
            }}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === "Backspace") {
                onTerminalInput("\u007f");
                return;
              }
            }}
            onSubmitEditing={() => {
              onTerminalInput("\r");
              resetNativeKeyboardInput();
            }}
            ref={nativeKeyboardInputRef}
            selection={{ end: nativeKeyboardInputValue.length, start: nativeKeyboardInputValue.length }}
            showSoftInputOnFocus
            spellCheck={false}
            style={NATIVE_KEYBOARD_INPUT_STYLE}
            value={nativeKeyboardInputValue}
          />
        </View>
        {showTimeline || showNativeTerminalKeyBar ? (
          <View
            style={{
              flexShrink: 0,
              marginBottom: accessoryBottomInset,
            }}
          >
            {showTimeline ? (
              <Pressable onPress={dismissTerminalKeyboard} style={{ flexShrink: 0 }}>
                <PaneBody
                  style={{
                    paddingBottom: keyboardVisible ? 12 : 16,
                    paddingTop: 16,
                  }}
                >
                  <ShellMessageTimeline messages={messages} />
                </PaneBody>
              </Pressable>
            ) : null}
            {showNativeTerminalKeyBar ? (
              <ShellNativeTerminalKeyBar
                disabled={isComposerDisabled}
                keyboardVisible={keyboardVisible}
                onDismissKeyboard={dismissTerminalKeyboard}
                onFocusKeyboard={focusNativeKeyboardInput}
                onPressKey={(input) => onTerminalInput(input)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

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

export function getShellTerminalEmptyCopy(selectedTerminal: TerminalItem, t: (key: string) => string) {
  return {
    emptyDescription:
      !selectedTerminal.session?.sessionId ||
      selectedTerminal.session.status === "exited" ||
      selectedTerminal.status === "initializing"
        ? t("shell.terminalFocusEmpty")
        : t("shell.terminalInputPlaceholder"),
    emptyStatusLabel: getTerminalStatusLabel(selectedTerminal.status, selectedTerminal.session?.status, t),
  };
}
