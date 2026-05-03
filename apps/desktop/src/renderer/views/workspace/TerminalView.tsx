import { Box, IconButton, InputBase, Stack } from "@mui/material";
import type { FitAddon } from "@xterm/addon-fit";
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCommands } from "../../hooks/useCommands";
import { tabStore } from "../../store/tabStore";
import type { WorkspaceTab } from "../../store/types";
import { workspaceStore } from "../../store/workspaceStore";
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
const MAX_TERMINAL_COMMAND_TITLE_LENGTH = 32;
const ASCII_ESCAPE_CODE = 27;
const ASCII_BELL_CODE = 7;
const ASCII_STRING_TERMINATOR_CODE = 156;

/** Renders an xterm instance and binds it to a daemon-backed terminal session. */
export function TerminalView({ tabId, focusRequestKey = 0 }: TerminalViewProps) {
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const outputSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const pendingCommandInputRef = useRef("");
  const readIndexRef = useRef(0);
  const didRequestCloseRef = useRef(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    closeTab,
    createTerminalSession,
    listTerminalSessions,
    readTerminalOutput,
    renameTab,
    resizeTerminal,
    subscribeTerminalOutput,
    writeTerminalInput,
  } = useCommands();

  /** Applies one readable command-derived title to this terminal tab. */
  const updateTerminalTabTitleFromCommand = useCallback(
    (command: string): void => {
      const title = formatTerminalCommandTitle(command);
      if (!title) {
        return;
      }

      renameTab(tabId, title);
    },
    [renameTab, tabId],
  );

  /** Applies one readable current-directory title to this terminal tab. */
  const updateTerminalTabTitleFromPath = useCallback(
    (path: string | undefined): void => {
      const title = formatTerminalPathTitle(path);
      if (!title) {
        return;
      }

      renameTab(tabId, title);
    },
    [renameTab, tabId],
  );

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

      const commandInput = collectExecutedTerminalCommand(pendingCommandInputRef.current, data);
      pendingCommandInputRef.current = commandInput.buffer;
      if (commandInput.executedCommand) {
        updateTerminalTabTitleFromCommand(commandInput.executedCommand);
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
  }, [resizeTerminal, updateTerminalTabTitleFromCommand, writeTerminalInput]);

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
      const terminalTab = tabStore
        .getState()
        .tabs.find(
          (candidate): candidate is Extract<WorkspaceTab, { kind: "terminal" }> =>
            candidate.id === tabId && candidate.kind === "terminal",
        );
      const launchCommand = terminalTab?.data.launchCommand;
      if (launchCommand) {
        updateTerminalTabTitleFromCommand(launchCommand);
      } else {
        updateTerminalTabTitleFromPath(resolveTerminalWorkspacePath(terminalTab));
      }

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
            updateTerminalTabTitleFromPath(extractPathTitleFromTerminalOutput(payload.chunk));
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
    updateTerminalTabTitleFromCommand,
    updateTerminalTabTitleFromPath,
    writeTerminalInput,
  ]);

  return (
    <Box
      ref={terminalHostRef}
      sx={{
        flex: 1,
        minHeight: 0,
        p: 1.5,
        bgcolor: "#1e1e1e",
        height: '100%',
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

/** Tracks typed terminal input and returns the most recent command submitted by Enter. */
function collectExecutedTerminalCommand(
  previousBuffer: string,
  data: string,
): { buffer: string; executedCommand?: string } {
  let buffer = previousBuffer;
  let executedCommand: string | undefined;
  const commandData = stripTerminalEscapeSequences(data);

  for (const character of commandData) {
    if (character === "\r" || character === "\n") {
      const normalizedCommand = normalizeTerminalCommandForTitle(buffer);
      if (normalizedCommand) {
        executedCommand = normalizedCommand;
      }
      buffer = "";
      continue;
    }

    if (character === "\u0003") {
      buffer = "";
      continue;
    }

    if (character === "\b" || character === "\u007f") {
      buffer = buffer.slice(0, -1);
      continue;
    }

    if (character >= " " && character !== "\u001b") {
      buffer += character;
    }
  }

  return { buffer, executedCommand };
}

/** Removes terminal control escape sequences that are not part of shell command text. */
function stripTerminalEscapeSequences(data: string): string {
  let output = "";

  for (let index = 0; index < data.length; index += 1) {
    const character = data[index];
    if (character?.charCodeAt(0) !== ASCII_ESCAPE_CODE) {
      output += character ?? "";
      continue;
    }

    if (data[index + 1] !== "[") {
      continue;
    }

    index += 1;
    while (index + 1 < data.length) {
      index += 1;
      const code = data.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        break;
      }
    }
  }

  return output;
}

/** Resolves one terminal tab's workspace root for the default terminal title. */
function resolveTerminalWorkspacePath(
  tab: Extract<WorkspaceTab, { kind: "terminal" }> | undefined,
): string | undefined {
  if (!tab) {
    return undefined;
  }

  return workspaceStore.getState().workspaces.find((workspace) => workspace.id === tab.workspaceId)?.worktreePath;
}

/** Extracts the last path-like title emitted via terminal OSC title sequences. */
function extractPathTitleFromTerminalOutput(output: string): string | undefined {
  let pathTitle: string | undefined;

  for (const title of extractTerminalOscTitles(output)) {
    const formattedTitle = formatTerminalPathTitle(title);
    if (formattedTitle) {
      pathTitle = title;
    }
  }

  return pathTitle;
}

/** Extracts OSC 0/2 terminal title payloads while ignoring color/control escape sequences. */
function extractTerminalOscTitles(output: string): string[] {
  const titles: string[] = [];

  for (let index = 0; index < output.length; index += 1) {
    if (output.charCodeAt(index) !== ASCII_ESCAPE_CODE || output[index + 1] !== "]") {
      continue;
    }

    index += 2;
    const commandStartIndex = index;
    while (index < output.length && output[index] !== ";") {
      index += 1;
    }
    const command = output.slice(commandStartIndex, index);
    if (output[index] !== ";") {
      continue;
    }

    index += 1;
    const titleStartIndex = index;
    while (index < output.length) {
      const code = output.charCodeAt(index);
      if (code === ASCII_BELL_CODE || code === ASCII_STRING_TERMINATOR_CODE) {
        break;
      }
      if (code === ASCII_ESCAPE_CODE && output[index + 1] === "\\") {
        break;
      }
      index += 1;
    }

    if (command === "0" || command === "2") {
      titles.push(output.slice(titleStartIndex, index));
    }
  }

  return titles;
}

/** Builds one concise tab title from a current working directory or terminal title payload. */
function formatTerminalPathTitle(path: string | undefined): string {
  const normalizedPath = normalizeTerminalCommandForTitle(path ?? "");
  if (!normalizedPath) {
    return "";
  }

  const pathCandidate = normalizedPath.includes(":")
    ? normalizedPath.slice(normalizedPath.lastIndexOf(":") + 1)
    : normalizedPath;
  const pathParts = pathCandidate.replace(/\\/g, "/").split("/").filter(Boolean);
  const directoryName = pathParts.at(-1) ?? pathCandidate.trim();
  return formatTerminalCommandTitle(directoryName || pathCandidate.trim());
}

/** Builds one concise terminal tab title from a submitted shell command. */
function formatTerminalCommandTitle(command: string): string {
  const normalizedCommand = normalizeTerminalCommandForTitle(command);
  if (!normalizedCommand) {
    return "";
  }

  if (normalizedCommand.length <= MAX_TERMINAL_COMMAND_TITLE_LENGTH) {
    return normalizedCommand;
  }

  return `${normalizedCommand.slice(0, MAX_TERMINAL_COMMAND_TITLE_LENGTH - 1)}…`;
}

/** Normalizes pasted or launch commands into one single-line label candidate. */
function normalizeTerminalCommandForTitle(command: string): string {
  return stripTerminalControlSequences(command).replace(/\s+/g, " ").trim();
}

/** Removes all non-printable control characters from one candidate tab title. */
function stripTerminalControlSequences(value: string): string {
  let output = "";

  for (const character of stripTerminalEscapeSequences(value)) {
    const code = character.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      output += character;
    }
  }

  return output;
}
