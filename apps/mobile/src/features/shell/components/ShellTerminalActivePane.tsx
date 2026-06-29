import type { ITheme } from "@xterm/xterm";
import type { DOMProps } from "expo/dom";

import { getTerminalStatusLabel } from "@/features/shell/view-model/shell-labels";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import { ShellTerminalNativePane } from "./ShellTerminalNativePane";
import { ShellTerminalXtermPane } from "./ShellTerminalXtermPane";

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
  if (usesTerminalEmulator) {
    return (
      <ShellTerminalXtermPane
        blurRequestToken={blurRequestToken}
        isComposerDisabled={isComposerDisabled}
        keyboardVisible={keyboardVisible}
        keyboardViewportInset={keyboardViewportInset}
        messages={messages}
        onDismissKeyboard={onDismissKeyboard}
        onTerminalInput={onTerminalInput}
        onTerminalResize={onTerminalResize}
        resizeRequestToken={resizeRequestToken}
        scrollbarThumbColor={scrollbarThumbColor}
        selectedTerminal={selectedTerminal}
        streamKey={streamKey}
        terminalDomProps={terminalDomProps}
        terminalOutput={terminalOutput}
        terminalTheme={terminalTheme}
      />
    );
  }

  return (
    <ShellTerminalNativePane
      displayOutput={displayOutput}
      emptyDescription={emptyDescription}
      emptyStatusLabel={emptyStatusLabel}
      messages={messages}
      selectedTerminal={selectedTerminal}
    />
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
