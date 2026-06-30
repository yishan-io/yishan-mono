import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useTheme } from "tamagui";

import type { TerminalItem } from "../state/shell.types";
import { sanitizeTerminalDisplayOutput } from "../state/terminal-output";
import {
  buildNativeTerminalStreamKey,
  buildTerminalDomProps,
  getTerminalKeyboardLayout,
  getTerminalPalette,
  resolveTerminalRendererKind,
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
  const usesTerminalEmulator = resolveTerminalRendererKind(Platform.OS, selectedTerminal) === "xterm";
  const displayOutput = usesTerminalEmulator ? terminalOutput : sanitizeTerminalDisplayOutput(terminalOutput);
  const [blurRequestToken, setBlurRequestToken] = useState(0);
  const [resizeRequestToken, setResizeRequestToken] = useState(0);
  const nativeStreamKey = buildNativeTerminalStreamKey(selectedTerminal, usesTerminalEmulator);
  const {
    composerBottomInset,
    keyboardVisible: systemKeyboardVisible,
    viewportBottomInset,
  } = useMemo(
    () => getTerminalKeyboardLayout({ keyboardBottomInset, usesTerminalEmulator }),
    [keyboardBottomInset, usesTerminalEmulator],
  );
  const { scrollbarThumbColor, terminalTheme } = useMemo(
    () => getTerminalPalette(theme.background.val, theme.color12.val),
    [theme],
  );
  const terminalDomProps = useMemo(
    () => buildTerminalDomProps(usesTerminalEmulator && Platform.OS !== "web"),
    [usesTerminalEmulator],
  );

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
    composerBottomInset,
    displayOutput,
    keyboardVisible: systemKeyboardVisible,
    nativeStreamKey,
    requestBlur: () => setBlurRequestToken((current) => current + 1),
    requestResize: () => setResizeRequestToken((current) => current + 1),
    resizeRequestToken,
    scrollbarThumbColor,
    terminalDomProps,
    terminalTheme,
    usesTerminalEmulator,
    viewportBottomInset,
  };
}
