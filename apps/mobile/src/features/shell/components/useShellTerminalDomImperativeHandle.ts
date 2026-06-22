import type { Terminal } from "@xterm/xterm";
import type { DOMImperativeFactory } from "expo/dom";
import { useDOMImperativeHandle } from "expo/dom";
import { type Ref, type RefObject, useRef } from "react";

import { blurTerminal, focusTerminal } from "./shell-terminal-dom-emulator-runtime";
import type { ShellTerminalDomEmulatorHandle } from "./shell-terminal-dom-emulator.types";

type UseShellTerminalDomImperativeHandleInput = {
  ref: Ref<ShellTerminalDomEmulatorHandle>;
  reportSizeRef: RefObject<(() => void) | null>;
  terminalRef: RefObject<Terminal | null>;
};

/**
 * Bridges the shell terminal imperative methods onto Expo DOM's imperative handle API.
 */
export function useShellTerminalDomImperativeHandle({
  ref,
  reportSizeRef,
  terminalRef,
}: UseShellTerminalDomImperativeHandleInput) {
  const imperativeHandleRef = useRef<ShellTerminalDomEmulatorHandle>({
    blur: () => {
      blurTerminal(terminalRef.current);
    },
    clear: () => {
      terminalRef.current?.reset();
    },
    focus: () => {
      focusTerminal(terminalRef.current);
    },
    reflow: () => {
      reportSizeRef.current?.();
    },
  });

  useDOMImperativeHandle(
    ref as Ref<DOMImperativeFactory>,
    (): DOMImperativeFactory => ({
      blur: () => {
        imperativeHandleRef.current.blur();
      },
      clear: () => {
        imperativeHandleRef.current.clear();
      },
      focus: () => {
        imperativeHandleRef.current.focus();
      },
      reflow: () => {
        imperativeHandleRef.current.reflow();
      },
    }),
    [],
  );

  return imperativeHandleRef;
}
