import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useTheme } from "tamagui";

import type { TerminalItem } from "../state/shell.types";
import { sanitizeTerminalDisplayOutput } from "../state/terminal-output";
import type { ShellTerminalDomEmulatorHandle } from "./shell-terminal-dom-emulator.types";
import {
  buildNativeTerminalStreamKey,
  buildTerminalDomProps,
  getTerminalKeyboardLayout,
  getTerminalPalette,
} from "./shell-terminal-surface-domain";

type UseShellTerminalSurfaceModelInput = {
  keyboardBottomInset?: number;
  selectedTerminal: TerminalItem | null;
  terminalOutput: string;
};

export function useShellTerminalSurfaceModel({
  keyboardBottomInset = 0,
  selectedTerminal,
  terminalOutput,
}: UseShellTerminalSurfaceModelInput) {
  const theme = useTheme();
  const usesTerminalEmulator = Platform.OS !== "web";
  const displayOutput = usesTerminalEmulator ? terminalOutput : sanitizeTerminalDisplayOutput(terminalOutput);
  const terminalHandleRef = useRef<ShellTerminalDomEmulatorHandle>(null);
  const [blurRequestToken, setBlurRequestToken] = useState(0);
  const [focusRequestToken, setFocusRequestToken] = useState(0);
  const [resizeRequestToken, setResizeRequestToken] = useState(0);
  const nativeStreamKey = buildNativeTerminalStreamKey(selectedTerminal, usesTerminalEmulator);
  const { keyboardVisible, viewportBottomInset } = useMemo(
    () => getTerminalKeyboardLayout({ keyboardBottomInset, usesTerminalEmulator }),
    [keyboardBottomInset, usesTerminalEmulator],
  );
  const { scrollbarThumbColor, terminalTheme } = useMemo(
    () => getTerminalPalette(theme.background.val, theme.color12.val),
    [theme],
  );
  const terminalDomProps = buildTerminalDomProps(usesTerminalEmulator && Platform.OS !== "web");

  useEffect(() => {
    if (!usesTerminalEmulator || !nativeStreamKey) {
      return;
    }

    // Refresh geometry when the mounted terminal stream changes.
    setResizeRequestToken((current) => current + 1);
  }, [nativeStreamKey, usesTerminalEmulator]);

  useEffect(() => {
    if (!usesTerminalEmulator || !nativeStreamKey) {
      return;
    }

    if (keyboardBottomInset < 0) {
      return;
    }

    setResizeRequestToken((current) => current + 1);
  }, [keyboardBottomInset, nativeStreamKey, usesTerminalEmulator]);

  return {
    blurRequestToken,
    displayOutput,
    focusRequestToken,
    keyboardVisible,
    nativeStreamKey,
    requestBlur: () => setBlurRequestToken((current) => current + 1),
    requestFocus: () => setFocusRequestToken((current) => current + 1),
    requestResize: () => setResizeRequestToken((current) => current + 1),
    resizeRequestToken,
    scrollbarThumbColor,
    terminalDomProps,
    terminalHandleRef,
    terminalTheme,
    usesTerminalEmulator,
    viewportBottomInset,
  };
}
