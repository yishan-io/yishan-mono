import type { ITheme } from "@xterm/xterm";
import type { DOMProps } from "expo/dom";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";

import { PaneBody } from "@/components/ui/PaneBody";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
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

type ShellTerminalXtermPaneProps = {
  blurRequestToken: number;
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
};

/** Renders the xterm-backed terminal surface used on native when the emulator is enabled. */
export function ShellTerminalXtermPane({
  blurRequestToken,
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
}: ShellTerminalXtermPaneProps) {
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
      {showTimeline || Platform.OS !== "web" ? (
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
          {Platform.OS !== "web" ? (
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
