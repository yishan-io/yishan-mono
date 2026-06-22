"use dom";

import type { ITheme, Terminal } from "@xterm/xterm";
import type { DOMProps } from "expo/dom";
import { type Ref, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

import { buildShellTerminalRootStyle, getShellTerminalViewportCss } from "./shell-terminal-dom-emulator-domain";
import type { ShellTerminalDomEmulatorHandle } from "./shell-terminal-dom-emulator.types";
import { useShellTerminalDomImperativeHandle } from "./useShellTerminalDomImperativeHandle";
import { useShellTerminalDomLifecycle } from "./useShellTerminalDomLifecycle";

type ShellTerminalDomEmulatorProps = {
  blurRequestToken?: number;
  dom?: DOMProps;
  focusRequestToken?: number;
  onInput: (data: string) => Promise<void> | void;
  onResize: (size: { cols: number; rows: number }) => Promise<void> | void;
  output?: string;
  ref: Ref<ShellTerminalDomEmulatorHandle>;
  resizeRequestToken?: number;
  scrollbarThumbColor?: string;
  streamKey: string;
  terminalTheme: ITheme;
};

const HOST_STYLE: React.CSSProperties = {
  boxSizing: "border-box",
  flex: 1,
  height: "100%",
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  padding: "0",
  width: "100%",
};

export default function ShellTerminalDomEmulator({
  blurRequestToken = 0,
  focusRequestToken = 0,
  onInput,
  onResize,
  output = "",
  ref,
  resizeRequestToken = 0,
  scrollbarThumbColor,
  streamKey,
  terminalTheme,
}: ShellTerminalDomEmulatorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const outputRef = useRef(output);
  const reportSizeRef = useRef<(() => void) | null>(null);
  const themeRef = useRef(terminalTheme);
  const resizeFrameRef = useRef<number | null>(null);
  const focusFrameRef = useRef<number | null>(null);

  onInputRef.current = onInput;
  onResizeRef.current = onResize;
  outputRef.current = output;
  themeRef.current = terminalTheme;

  useShellTerminalDomImperativeHandle({
    ref,
    reportSizeRef,
    terminalRef,
  });

  useShellTerminalDomLifecycle({
    blurRequestToken,
    focusFrameRef,
    focusRequestToken,
    hostRef,
    onInputRef,
    onResizeRef,
    output,
    outputRef,
    reportSizeRef,
    resizeFrameRef,
    resizeRequestToken,
    streamKey,
    terminalRef,
    terminalTheme,
    themeRef,
  });

  const rootStyle = buildShellTerminalRootStyle(terminalTheme, scrollbarThumbColor);

  return (
    <div data-testid="shell-terminal-dom-root" style={rootStyle}>
      <style>{getShellTerminalViewportCss()}</style>
      <div ref={hostRef} style={HOST_STYLE} />
    </div>
  );
}
