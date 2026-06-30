import { TextInput } from "react-native";

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

type ShellTerminalKeyboardBridgeInputProps = {
  inputValue: string;
  inputValueRef: React.MutableRefObject<string>;
  onTerminalInput: (data: string) => void;
  resetInput: () => void;
  textInputRef: React.RefObject<TextInput | null>;
};

/** Bridges the native software keyboard into the xterm session input stream. */
export function ShellTerminalKeyboardBridgeInput({
  inputValue,
  inputValueRef,
  onTerminalInput,
  resetInput,
  textInputRef,
}: ShellTerminalKeyboardBridgeInputProps) {
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      blurOnSubmit={false}
      caretHidden
      onChangeText={(nextValue) => {
        const containsLineBreak = /[\r\n]/.test(nextValue);
        const currentValue = inputValueRef.current;
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

        resetInput();
      }}
      onKeyPress={({ nativeEvent }) => {
        if (nativeEvent.key === "Backspace") {
          onTerminalInput("\u007f");
        }
      }}
      onSubmitEditing={() => {
        onTerminalInput("\r");
        resetInput();
      }}
      ref={textInputRef}
      selection={{ end: inputValue.length, start: inputValue.length }}
      showSoftInputOnFocus
      spellCheck={false}
      style={NATIVE_KEYBOARD_INPUT_STYLE}
      value={inputValue}
    />
  );
}
