import { Box } from "@mui/material";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { memo, useCallback, useEffect, useRef } from "react";
import { FloatingVoiceButton } from "../../../components/FloatingVoiceButton";
import { writeTerminalInput } from "../../../commands/terminalCommands";
import { layoutStore } from "../../../store/settings/layoutStore";
import { useTerminalSearchState } from "./useTerminalSearchState";
import { TerminalSearchPanel } from "./TerminalSearchPanel";
import { useTerminalFileDrop } from "./useTerminalFileDrop";
import {
  attachTerminalRuntime,
  detachTerminalRuntime,
  ensureTerminalRuntime,
  getTerminalRuntime,
} from "./terminalRuntimeRegistry";
import { initTerminalSessionLifecycle } from "./terminalSessionService";

type TerminalViewProps = {
  tabId: string;
  focusRequestKey?: number;
  showVoiceButton?: boolean;
};

/**
 * Thin React adapter for a registry-managed terminal runtime.
 *
 * This component does NOT own the xterm Terminal instance. Instead it:
 * 1. Ensures a runtime entry exists in the registry (idempotent).
 * 2. Attaches the runtime's host element to a visible placeholder on mount.
 * 3. Detaches on unmount (terminal stays alive in offscreen parking area).
 * 4. Manages UI-only concerns: search panel, drag/drop overlay, focus, keyboard shortcuts.
 */
export const TerminalView = memo(function TerminalView({ tabId, focusRequestKey = 0, showVoiceButton = false }: TerminalViewProps) {
  const isVoiceInputEnabled = layoutStore((state) => state.isVoiceInputEnabled);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Stable refs that point into the registry entry — these survive remount.
  const xtermRef = useRef<Terminal | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Sync refs from registry on every render (cheap, no allocation).
  const entry = getTerminalRuntime(tabId);
  if (entry) {
    xtermRef.current = entry.terminal;
    searchAddonRef.current = entry.searchAddon;
    sessionIdRef.current = entry.sessionId;
  }

  const handleVoiceText = useCallback(async (text: string) => {
    const sessionId = getTerminalRuntime(tabId)?.sessionId ?? sessionIdRef.current;
    if (!sessionId) {
      throw new Error("Terminal session is not ready yet.");
    }

    await writeTerminalInput({ sessionId, data: text });
  }, [tabId]);

  // ─── Attach/Detach Lifecycle ────────────────────────────────────────────────

  useEffect(() => {
    const placeholder = placeholderRef.current;
    if (!placeholder) {
      return;
    }

    // Ensure runtime exists and session lifecycle is initialized.
    const runtime = ensureTerminalRuntime(tabId);
    initTerminalSessionLifecycle(tabId);

    // Sync refs after ensure (in case this is the first render).
    xtermRef.current = runtime.terminal;
    searchAddonRef.current = runtime.searchAddon;
    sessionIdRef.current = runtime.sessionId;

    // Attach the terminal host to overlay this placeholder.
    attachTerminalRuntime(tabId, placeholder);

    return () => {
      detachTerminalRuntime(tabId, placeholder);
    };
  }, [tabId]);

  // ─── Search ─────────────────────────────────────────────────────────────────

  const searchState = useTerminalSearchState({
    searchInputRef,
    xtermRef,
    searchAddonRef,
    focusRequestKey,
  });
  const {
    isSearchOpen: isSearchPanelOpen,
    searchQuery: terminalSearchQuery,
    setSearchQuery: setTerminalSearchQuery,
    runTerminalSearch,
    closeSearchPanel,
  } = searchState;

  // ─── File Drop ──────────────────────────────────────────────────────────────

  const { isFileDragOver } = useTerminalFileDrop({
    tabId,
    xtermRef,
    sessionIdRef,
  });

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        minHeight: 0,
        pt: 1.5,
        pl: 2,
        bgcolor: "#2b3038",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {isFileDragOver ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: (theme) => `${theme.palette.primary.main}14`,
            border: "2px dashed",
            borderColor: "primary.main",
            borderRadius: 1,
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              typography: "body2",
              color: "primary.main",
              fontWeight: 500,
              px: 2,
              py: 0.75,
              borderRadius: 1,
              bgcolor: "rgba(0, 0, 0, 0.6)",
            }}
          >
            Drop to insert file path
          </Box>
        </Box>
      ) : null}
      {isSearchPanelOpen ? (
        <TerminalSearchPanel
          anchorRef={containerRef}
          searchInputRef={searchInputRef}
          searchQuery={terminalSearchQuery}
          onSearchQueryChange={setTerminalSearchQuery}
          onSearchPrevious={() => {
            runTerminalSearch("previous");
          }}
          onSearchNext={() => {
            runTerminalSearch("next");
          }}
          onClose={closeSearchPanel}
        />
       ) : null}
      <Box
        ref={placeholderRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      />
      {isVoiceInputEnabled && showVoiceButton ? <FloatingVoiceButton onText={handleVoiceText} /> : null}
    </Box>
  );
});
