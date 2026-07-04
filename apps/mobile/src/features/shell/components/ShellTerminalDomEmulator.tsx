"use dom";

import type { ITheme, Terminal } from "@xterm/xterm";
import { type DOMImperativeFactory, type DOMProps, useDOMImperativeHandle } from "expo/dom";
import { type Ref, forwardRef, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

import { buildShellTerminalRootStyle, getShellTerminalViewportCss } from "../domain/shell-terminal-dom-emulator-domain";
import { blurTerminal, readTerminalPlainTextSnapshot } from "./shell-terminal-dom-emulator-runtime";
import { useShellTerminalDomLifecycle } from "./useShellTerminalDomLifecycle";

export type ShellTerminalDomEmulatorHandle = {
  blurInputSession: () => void;
  copySelection: () => string;
  hasSelection: () => boolean;
  pickImageFile: () => Promise<{
    base64Data: string;
    fileName: string;
    mimeType: string;
  } | null>;
  pasteText: (text: string) => void;
  readPlainTextSnapshot: () => string;
  selectAll: () => void;
};

type ShellTerminalDomEmulatorProps = {
  blurRequestToken?: number;
  dom?: DOMProps;
  onInput: (data: string) => Promise<void> | void;
  onTapInputSession?: ((inputSessionActive: boolean) => void) | null;
  onResize: (size: { cols: number; rows: number }) => Promise<void> | void;
  output?: string;
  resizeRequestToken?: number;
  scrollbarThumbColor?: string;
  streamKey: string;
  terminalId: string;
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

const ShellTerminalDomEmulator = forwardRef<ShellTerminalDomEmulatorHandle, ShellTerminalDomEmulatorProps>(
  function ShellTerminalDomEmulator(
    {
      blurRequestToken = 0,
      onInput,
      onTapInputSession,
      onResize,
      output = "",
      resizeRequestToken = 0,
      scrollbarThumbColor,
      streamKey,
      terminalId,
      terminalTheme,
    }: ShellTerminalDomEmulatorProps,
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const onInputRef = useRef(onInput);
    const onTapInputSessionRef = useRef(onTapInputSession);
    const onResizeRef = useRef(onResize);
    const outputRef = useRef(output);
    const renderedOutputRef = useRef(output);
    const reportSizeRef = useRef<(() => void) | null>(null);
    const themeRef = useRef(terminalTheme);
    const resizeFrameRef = useRef<number | null>(null);

    onInputRef.current = onInput;
    onTapInputSessionRef.current = onTapInputSession;
    onResizeRef.current = onResize;
    outputRef.current = output;
    themeRef.current = terminalTheme;

    useDOMImperativeHandle(
      ref as Ref<DOMImperativeFactory>,
      () => ({
        blurInputSession() {
          blurTerminal(terminalRef.current);
        },
        copySelection() {
          return terminalRef.current?.getSelection() ?? "";
        },
        hasSelection() {
          return terminalRef.current?.hasSelection() ?? false;
        },
        async pickImageFile() {
          if (typeof document === "undefined") {
            return null;
          }

          const pickerInput = document.createElement("input");
          pickerInput.accept = "image/*";
          pickerInput.style.display = "none";
          pickerInput.type = "file";
          document.body.appendChild(pickerInput);

          try {
            const file = await new Promise<File | null>((resolve) => {
              pickerInput.addEventListener(
                "change",
                () => {
                  resolve(pickerInput.files?.[0] ?? null);
                },
                { once: true },
              );
              pickerInput.click();
            });

            if (!file) {
              return null;
            }

            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => {
                reject(reader.error ?? new Error("Failed to read picked image."));
              };
              reader.onload = () => {
                if (typeof reader.result !== "string") {
                  reject(new Error("Picked image did not produce a data URL."));
                  return;
                }

                resolve(reader.result);
              };
              reader.readAsDataURL(file);
            });

            const [, base64Data = ""] = dataUrl.split(",", 2);
            if (!base64Data) {
              return null;
            }

            return {
              base64Data,
              fileName: file.name,
              mimeType: file.type || "image/png",
            };
          } finally {
            pickerInput.remove();
          }
        },
        pasteText(...args: unknown[]) {
          const [text] = args;
          if (typeof text !== "string" || !text) {
            return;
          }

          terminalRef.current?.paste(text);
        },
        readPlainTextSnapshot() {
          return readTerminalPlainTextSnapshot(terminalRef.current);
        },
        selectAll() {
          terminalRef.current?.selectAll();
        },
      }),
      [],
    );

    useShellTerminalDomLifecycle({
      blurRequestToken,
      hostRef,
      onInputRef,
      onTapInputSessionRef,
      onResizeRef,
      output,
      outputRef,
      renderedOutputRef,
      reportSizeRef,
      resizeFrameRef,
      resizeRequestToken,
      streamKey,
      terminalId,
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
  },
);

export default ShellTerminalDomEmulator;
