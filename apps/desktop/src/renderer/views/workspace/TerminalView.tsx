import { Box, IconButton, InputBase, Stack } from "@mui/material";
import type { FitAddon } from "@xterm/addon-fit";
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCommands } from "../../hooks/useCommands";
import { loadTerminalAddons } from "./terminalAddons";
import { TerminalSessionOrchestrator } from "./terminalSessionOrchestrator";

type TerminalViewProps = {
  tabId: string;
  focusRequestKey?: number;
};

const TERMINAL_SEARCH_OPTIONS: ISearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  incremental: true,
};

/** Renders an xterm instance and binds it to a daemon-backed terminal session. */
export function TerminalView({ tabId, focusRequestKey = 0 }: TerminalViewProps) {
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const outputSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const readIndexRef = useRef(0);
  const didRequestCloseRef = useRef(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    closeTab,
    createTerminalSession,
    listTerminalSessions,
    readTerminalOutput,
    resizeTerminal,
    subscribeTerminalOutput,
    writeTerminalInput,
  } = useCommands();

  /** Clears current search decorations in the active terminal session. */
  const clearTerminalSearchHighlights = useCallback((): void => {
    const searchAddon = searchAddonRef.current;
    if (!searchAddon) {
      return;
    }

    const searchAddonWithClear = searchAddon as unknown as {
      clearDecorations?: () => void;
      clearActiveDecoration?: () => void;
    };
    searchAddonWithClear.clearDecorations?.();
    searchAddonWithClear.clearActiveDecoration?.();
  }, []);

  /** Runs one terminal-buffer search in the requested direction. */
  const runTerminalSearch = useCallback(
    (direction: "next" | "previous"): void => {
      const searchAddon = searchAddonRef.current;
      const query = searchQuery.trim();
      if (!searchAddon || query.length === 0) {
        return;
      }

      if (direction === "next") {
        searchAddon.findNext(query, TERMINAL_SEARCH_OPTIONS);
        return;
      }

      searchAddon.findPrevious(query, TERMINAL_SEARCH_OPTIONS);
    },
    [searchQuery],
  );

  /** Closes the search UI and clears all in-terminal search highlights. */
  const closeSearchPanel = useCallback((): void => {
    setIsSearchOpen(false);
    setSearchQuery("");
    clearTerminalSearchHighlights();
    xtermRef.current?.focus();
  }, [clearTerminalSearchHighlights]);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host) {
      return;
    }
    let disposed = false;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"MesloLGS NF", "JetBrains Mono", "SF Mono", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
      },
    });
    const { fitAddon, searchAddon } = loadTerminalAddons(terminal);
    terminal.open(host);
    safeFitTerminalToHost(terminal, fitAddon);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    terminal.attachCustomKeyEventHandler((event) => {
      if (shouldReleaseCommandWForTabCloseShortcut(event)) {
        return false;
      }

      if (shouldClearTerminalOutputShortcut(event)) {
        if (event.type === "keydown") {
          terminal.clear();
        }
        return false;
      }

      if (!isShiftEnterLineFeedChord(event)) {
        return true;
      }

      if (event.type !== "keydown") {
        return false;
      }

      if (!sessionIdRef.current) {
        return false;
      }

      terminal.paste("\n");
      return false;
    });

    const writeDisposable = terminal.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      void writeTerminalInput({ sessionId, data }).catch((error) => {
        reportTerminalAsyncError("write terminal input", error);
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      if (disposed) {
        return;
      }

      safeFitTerminalToHost(terminal, fitAddon);
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }

      void resizeTerminal({ sessionId, cols: terminal.cols, rows: terminal.rows }).catch((error) => {
        reportTerminalAsyncError("resize terminal", error);
      });
    });
    resizeObserver.observe(host);

    return () => {
      disposed = true;
      writeDisposable.dispose();
      outputSubscriptionRef.current?.unsubscribe();
      outputSubscriptionRef.current = null;
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [resizeTerminal, writeTerminalInput]);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      if (!isSearchOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeSearchPanel();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        runTerminalSearch(event.shiftKey ? "previous" : "next");
      }
    };

    host.addEventListener("keydown", onKeyDown);
    return () => {
      host.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSearchPanel, isSearchOpen, runTerminalSearch]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    if (focusRequestKey <= 0 || isSearchOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      xtermRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [focusRequestKey, isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const query = searchQuery.trim();
    if (query.length === 0) {
      clearTerminalSearchHighlights();
      return;
    }

    searchAddonRef.current?.findNext(query, TERMINAL_SEARCH_OPTIONS);
  }, [clearTerminalSearchHighlights, isSearchOpen, searchQuery]);

  useEffect(() => {
    const terminal = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }
    let cancelled = false;
    const sessionOrchestrator = new TerminalSessionOrchestrator({
      createTerminalSession,
      listTerminalSessions,
      readTerminalOutput,
      resizeTerminal,
      writeTerminalInput,
    });

    const attachSession = async () => {
      const restored = await sessionOrchestrator.attachOrCreateAndRestore({
        tabId,
        terminal,
        fitAddon,
      });
      if (!restored) {
        return;
      }
      if (cancelled) {
        return;
      }

      sessionIdRef.current = restored.sessionId;
      readIndexRef.current = restored.nextIndex;
      didRequestCloseRef.current = false;

      outputSubscriptionRef.current?.unsubscribe();
      outputSubscriptionRef.current = await subscribeTerminalOutput({
        sessionId: restored.sessionId,
        onData: (payload) => {
          if (payload.sessionId !== sessionIdRef.current) {
            return;
          }

          if (payload.type === "output") {
            if (payload.nextIndex <= readIndexRef.current) {
              return;
            }

            readIndexRef.current = payload.nextIndex;
            if (payload.chunk.length > 0) {
              if (!isTerminalAttached(terminal)) {
                return;
              }

              terminal.write(payload.chunk);
            }
            return;
          }

          if (didRequestCloseRef.current) {
            return;
          }
          didRequestCloseRef.current = true;
          closeTab(tabId);
        },
        onError: (error) => {
          reportTerminalAsyncError("subscribe terminal output", error);
        },
      });

      if (cancelled) {
        outputSubscriptionRef.current?.unsubscribe();
        outputSubscriptionRef.current = null;
        return;
      }

      if (restored.exited && !didRequestCloseRef.current) {
        didRequestCloseRef.current = true;
        closeTab(tabId);
      }
    };

    void attachSession().catch((error) => {
      reportTerminalAsyncError("attach terminal session", error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    closeTab,
    createTerminalSession,
    listTerminalSessions,
    readTerminalOutput,
    resizeTerminal,
    subscribeTerminalOutput,
    tabId,
    writeTerminalInput,
  ]);

  return (
    <Box
      ref={terminalHostRef}
      sx={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        px: 1.5,
        bgcolor: "#1e1e1e",
        "& .xterm": {
          height: "100%",
          pt: 1,
        },
        "& .xterm-viewport": {
          overflowY: "auto",
        },
      }}
    >
      {isSearchOpen ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            position: "absolute",
            top: 8,
            right: 12,
            alignItems: "center",
            px: 1,
            py: 0.5,
            border: "1px solid #3a3a3a",
            borderRadius: 1,
            bgcolor: "#252526",
            zIndex: 2,
          }}
        >
          <InputBase
            inputRef={searchInputRef}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Find"
            slotProps={{
              input: {
                "aria-label": "Search terminal output",
              },
            }}
            sx={{
              width: 220,
              px: 0.75,
              py: 0.25,
              border: "1px solid #3a3a3a",
              borderRadius: 0.75,
              color: "#d4d4d4",
              fontSize: 13,
            }}
          />
          <IconButton
            aria-label="Previous terminal match"
            size="small"
            disabled={searchQuery.trim().length === 0}
            onClick={() => {
              runTerminalSearch("previous");
            }}
            sx={{
              color: "#d4d4d4",
              fontSize: 11,
              "&.Mui-disabled": {
                color: "#8b8b8b",
              },
            }}
          >
            Prev
          </IconButton>
          <IconButton
            aria-label="Next terminal match"
            size="small"
            disabled={searchQuery.trim().length === 0}
            onClick={() => {
              runTerminalSearch("next");
            }}
            sx={{
              color: "#d4d4d4",
              fontSize: 11,
              "&.Mui-disabled": {
                color: "#8b8b8b",
              },
            }}
          >
            Next
          </IconButton>
          <IconButton
            aria-label="Close terminal search"
            size="small"
            onClick={closeSearchPanel}
            sx={{ color: "#d4d4d4", fontSize: 11 }}
          >
            Close
          </IconButton>
        </Stack>
      ) : null}
    </Box>
  );
}

/** Reports one terminal async error without breaking render lifecycle. */
function reportTerminalAsyncError(action: string, error: unknown): void {
  console.error(`[TerminalView] Failed to ${action}`, error);
}

/** Returns true when xterm should skip handling so renderer Cmd+W can close one terminal tab. */
function shouldReleaseCommandWForTabCloseShortcut(event: KeyboardEvent): boolean {
  return (
    isMacPlatform() &&
    event.type === "keydown" &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "w"
  );
}

/** Returns true when macOS Cmd+K should clear local terminal output instead of reaching the shell. */
function shouldClearTerminalOutputShortcut(event: KeyboardEvent): boolean {
  return (
    isMacPlatform() &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}

/** Returns true when one keyboard event is an unmodified Shift+Enter line-feed chord. */
function isShiftEnterLineFeedChord(event: KeyboardEvent): boolean {
  return event.key === "Enter" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
}

/** Returns true when the current renderer runs on one macOS platform. */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgentDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    ?.platform;
  const platformHint = (userAgentDataPlatform ?? navigator.userAgent).toLowerCase();
  return platformHint.includes("mac");
}

/** Fits one attached xterm instance to its host without throwing during teardown races. */
function safeFitTerminalToHost(terminal: Terminal, fitAddon: FitAddon): void {
  if (!isTerminalAttached(terminal)) {
    return;
  }

  try {
    fitAddon.fit();
  } catch (error) {
    reportTerminalAsyncError("fit terminal", error);
  }
}

/** Returns true when one xterm instance is still attached to one DOM element. */
function isTerminalAttached(terminal: Terminal): boolean {
  if (!("element" in terminal)) {
    return true;
  }

  return Boolean(terminal.element);
}
