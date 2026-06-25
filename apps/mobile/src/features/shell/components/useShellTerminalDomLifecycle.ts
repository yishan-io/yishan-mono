import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import { type RefObject, useEffect } from "react";

import { buildShellTerminalOptions } from "./shell-terminal-dom-emulator-domain";
import {
  attachTerminalTouchScrollFallback,
  blurTerminal,
  focusTerminal,
  stabilizeTerminalViewport,
} from "./shell-terminal-dom-emulator-runtime";
import { mountTerminalOutputRuntime, unmountTerminalOutputRuntime } from "../terminal/terminalOutputRuntimeRegistry";

type UseShellTerminalDomLifecycleInput = {
  blurRequestToken: number;
  focusFrameRef: RefObject<number | null>;
  focusRequestToken: number;
  hostRef: RefObject<HTMLDivElement | null>;
  onInputRef: RefObject<(data: string) => Promise<void> | void>;
  onResizeRef: RefObject<(size: { cols: number; rows: number }) => Promise<void> | void>;
  output: string;
  outputRef: RefObject<string>;
  reportSizeRef: RefObject<(() => void) | null>;
  resizeFrameRef: RefObject<number | null>;
  resizeRequestToken: number;
  streamKey: string;
  terminalId: string;
  terminalRef: RefObject<Terminal | null>;
  terminalTheme: ITheme;
  themeRef: RefObject<ITheme>;
};

/**
 * Owns the xterm mount/unmount and refresh effects for the shell DOM emulator.
 */
export function useShellTerminalDomLifecycle({
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
  terminalId,
  terminalRef,
  terminalTheme,
  themeRef,
}: UseShellTerminalDomLifecycleInput) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.dataset.streamKey = streamKey;
    host.innerHTML = "";

    const terminal = new Terminal(buildShellTerminalOptions(themeRef.current));
    const fitAddon = new FitAddon();
    let cancelViewportStabilize: (() => void) | null = null;
    let detachTouchScrollFallback: (() => void) | null = null;
    const handleInput = terminal.onData((data) => {
      void onInputRef.current(data);
    });

    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminalRef.current = terminal;
    detachTouchScrollFallback = attachTerminalTouchScrollFallback(host, terminal);

    const runLayoutPass = () => {
      fitAddon.fit();
      void onResizeRef.current({ cols: terminal.cols, rows: terminal.rows });
    };

    const reportSize = () => {
      cancelViewportStabilize?.();
      cancelViewportStabilize = stabilizeTerminalViewport(
        terminal,
        requestAnimationFrame,
        cancelAnimationFrame,
        runLayoutPass,
      );
    };
    reportSizeRef.current = reportSize;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        reportSize();
      });
    });

    resizeObserver.observe(host);

    mountTerminalOutputRuntime({
      fallbackOutput: outputRef.current,
      terminal,
      terminalId,
    });
    reportSize();
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null;
      focusTerminal(terminal);
    });

    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      if (focusFrameRef.current !== null) {
        cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
      }

      resizeObserver.disconnect();
      handleInput.dispose();
      cancelViewportStabilize?.();
      detachTouchScrollFallback?.();
      unmountTerminalOutputRuntime({
        terminal,
        terminalId,
      });
      terminal.dispose();
      terminalRef.current = null;
      reportSizeRef.current = null;
    };
  }, [
    focusFrameRef,
    hostRef,
    onInputRef,
    onResizeRef,
    outputRef,
    reportSizeRef,
    resizeFrameRef,
    streamKey,
    terminalId,
    terminalRef,
    themeRef,
  ]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = terminalTheme;
    terminal.refresh(0, Math.max(0, terminal.rows - 1));
  }, [terminalRef, terminalTheme]);

  useEffect(() => {
    if (blurRequestToken <= 0) {
      return;
    }

    blurTerminal(terminalRef.current);
  }, [blurRequestToken, terminalRef]);

  useEffect(() => {
    if (focusRequestToken <= 0) {
      return;
    }

    reportSizeRef.current?.();
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
    }

    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null;
      focusTerminal(terminalRef.current);
    });
  }, [focusFrameRef, focusRequestToken, reportSizeRef, terminalRef]);

  useEffect(() => {
    if (resizeRequestToken <= 0) {
      return;
    }

    reportSizeRef.current?.();
  }, [reportSizeRef, resizeRequestToken]);
}
