import type { DragEvent, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Terminal } from "@xterm/xterm";
import {
  FILETREE_DRAG_MIME,
  extractSourcePathsFromDataTransfer,
  hasExternalFileDragIntent,
  resolveInternalFileTreeDragPaths,
} from "../../../components/FileTree/dataTransfer";
import { escapePathsForShell } from "./terminalPathEscape";
import { getTerminalRuntime } from "./terminalRuntimeRegistry";

type UseTerminalFileDropOptions = {
  /** Tab id used to look up the xterm host element from the runtime registry. */
  tabId: string;
  /** Ref to the xterm Terminal instance. */
  xtermRef: RefObject<Terminal | null>;
  /** Ref to the active session id — drop is only handled when a session is active. */
  sessionIdRef: RefObject<string | null>;
};

type UseTerminalFileDropResult = {
  /** True while a valid file drag is hovering over the terminal container. */
  isFileDragOver: boolean;
};

/**
 * Returns true when the drag payload contains an internal file-tree drag
 * (identified by the custom {@link FILETREE_DRAG_MIME} type).
 */
function hasFileTreeDragIntent(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(FILETREE_DRAG_MIME);
}

/**
 * Extracts absolute file paths from an internal file-tree drag payload.
 * Returns an empty array when the payload is missing or malformed.
 */
function extractFileTreeDragPaths(dataTransfer: DataTransfer): string[] {
  const raw = dataTransfer.getData(FILETREE_DRAG_MIME);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Accept both legacy string[] and current { path, isDirectory }[] payload formats.
    return parsed.flatMap((item) => {
      if (typeof item === "string" && item.length > 0) return [item];
      if (item && typeof item === "object") {
        const path = (item as Record<string, unknown>).path;
        return typeof path === "string" && path.length > 0 ? [path] : [];
      }
      return [];
    });
  } catch {
    return [];
  }
}

async function extractDroppedPathsForDrop(dataTransfer: DataTransfer): Promise<string[]> {
  const fileTreePaths = await resolveInternalFileTreeDragPaths(dataTransfer);
  if (fileTreePaths.length > 0) {
    return fileTreePaths;
  }

  return extractSourcePathsFromDataTransfer(dataTransfer);
}

/**
 * Returns true when a drag event carries either an internal file-tree drag
 * or an external OS file drag that the terminal should accept.
 */
function isAcceptableFileDrag(event: globalThis.DragEvent): boolean {
  if (!event.dataTransfer) {
    return false;
  }

  if (hasFileTreeDragIntent(event.dataTransfer)) {
    return true;
  }

  // Fall back to the external-file heuristic used by the FileTree component.
  const reactishEvent = event as unknown as DragEvent<HTMLElement>;
  if (hasExternalFileDragIntent(reactishEvent)) {
    return true;
  }

  // Some environments strip custom MIME types during internal drags but still
  // preserve the absolute file path in text/plain. Accept those drags too.
  return extractDroppedPaths(event.dataTransfer).length > 0;
}

/**
 * Extracts file paths from a drop event, handling both internal file-tree
 * drags and external OS file drops.
 */
function extractDroppedPaths(dataTransfer: DataTransfer): string[] {
  // Internal file-tree drag takes priority — its paths are already absolute.
  const fileTreePaths = extractFileTreeDragPaths(dataTransfer);
  if (fileTreePaths.length > 0) {
    return fileTreePaths;
  }

  // Fall back to external OS file extraction.
  return extractSourcePathsFromDataTransfer(dataTransfer);
}

/**
 * Attaches drag-and-drop event listeners to the xterm host element so that
 * dropping files — either from the internal file tree or from the OS — inserts
 * their shell-escaped paths at the current cursor position.
 *
 * Design decisions:
 * - Listens on the xterm `hostElement` from the runtime registry rather than
 *   the React placeholder `containerRef`. The xterm host is an absolutely-
 *   positioned element rendered outside the React tree (via runtimeSurfaceLayer)
 *   that sits on top of the placeholder and actually receives pointer/drag
 *   events. The React placeholder box sits behind the host and never receives
 *   dragenter/dragover from the OS or file-tree drags.
 * - Uses native DOM listeners (not React synthetic events) because xterm
 *   already captures pointer/keyboard events on its own canvas and React
 *   synthetic drag events can interfere with xterm's internal handling.
 * - Prevents default on dragover/dragenter so the browser accepts the drop.
 * - Uses `terminal.paste()` which writes text into the terminal input buffer
 *   and triggers `onData`, which sends it to the PTY — consistent with how
 *   clipboard paste and Shift+Enter already work in TerminalView.
 * - Multiple files are space-separated, each independently escaped.
 */
export function useTerminalFileDrop({
  tabId,
  xtermRef,
  sessionIdRef,
}: UseTerminalFileDropOptions): UseTerminalFileDropResult {
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const dragEnterCountRef = useRef(0);

  const handleDragOver = useCallback((event: globalThis.DragEvent) => {
    if (!isAcceptableFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDragEnter = useCallback((event: globalThis.DragEvent) => {
    if (!isAcceptableFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragEnterCountRef.current += 1;
    if (dragEnterCountRef.current === 1) {
      setIsFileDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((_event: globalThis.DragEvent) => {
    dragEnterCountRef.current = Math.max(0, dragEnterCountRef.current - 1);
    if (dragEnterCountRef.current === 0) {
      setIsFileDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (event: globalThis.DragEvent) => {
      dragEnterCountRef.current = 0;
      setIsFileDragOver(false);

      const terminal = xtermRef.current;
      const sessionId = sessionIdRef.current;
      const dt = event.dataTransfer;

      if (!terminal || !sessionId || !dt) {
        return;
      }

      if (!isAcceptableFileDrag(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const paths = await extractDroppedPathsForDrop(dt);
      if (paths.length === 0) {
        return;
      }

      const escapedText = escapePathsForShell(paths);
      terminal.paste(escapedText);
      terminal.focus();
    },
    [xtermRef, sessionIdRef],
  );

  useEffect(() => {
    // Attach listeners to the xterm hostElement from the runtime registry.
    // The hostElement is an absolutely-positioned DOM node rendered outside
    // the React tree that overlays the placeholder — it is the element that
    // actually receives drag events from the OS and internal file-tree drags.
    const runtime = getTerminalRuntime(tabId);
    const hostElement = runtime?.hostElement;
    if (!hostElement) {
      return;
    }

    hostElement.addEventListener("dragover", handleDragOver);
    hostElement.addEventListener("dragenter", handleDragEnter);
    hostElement.addEventListener("dragleave", handleDragLeave);
    hostElement.addEventListener("drop", handleDrop);

    return () => {
      hostElement.removeEventListener("dragover", handleDragOver);
      hostElement.removeEventListener("dragenter", handleDragEnter);
      hostElement.removeEventListener("dragleave", handleDragLeave);
      hostElement.removeEventListener("drop", handleDrop);
    };
  }, [tabId, handleDragOver, handleDragEnter, handleDragLeave, handleDrop]);

  return { isFileDragOver };
}
