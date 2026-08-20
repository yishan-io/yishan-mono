/**
 * React wrapper around the Vditor IR markdown editor.
 *
 * Mounts the Vditor editor factory on a per-file basis (remount driven by
 * `key={path}` at the call site). Emits content changes through
 * `onContentChange` for the parent to wire into the existing Monaco model
 * pipeline. Applies external content changes and respects read-only state
 * for deleted files.
 *
 * Vditor is imported lazily — its CSS (dist/index.css + vditorTheme.css)
 * lands in the lazy chunk alongside the factory.
 */

import { displaySettingsStore } from "@renderer/domains/settings";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { i18n } from "../../../../i18n";
import { DiagramZoomOverlay } from "../../ui/DiagramZoomOverlay";
import { normalizeMarkdown, shouldApplyExternalContent } from "./editorContentSync";
import { type VditorEditorHandle, resolveVditorLang } from "./vditorEditor";
import { acquireVditorEditor } from "./vditorEditorRegistry";
import { useVditorContentSync } from "./useVditorContentSync";
import { useVditorFocusRequest } from "./useVditorFocusRequest";
import { useVditorTheme } from "./useVditorTheme";
import { useVditorWindowInteractions } from "./useVditorWindowInteractions";
import "vditor/dist/index.css";
import "./vditorTheme.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VditorFileEditorProps {
  /** File path — remount is driven by `key={path}` at the call site. */
  path: string;
  /** Markdown content for the file. */
  content: string;
  /** When true, the editor is read-only and suppresses change emissions. */
  isDeleted: boolean;
  /**
   * When true, the editor is view-only (user toggled from the toolbar):
   * contenteditable is off and emissions are suppressed, but external
   * content changes still apply so the view stays current.
   */
  readOnly?: boolean;
  /**
   * Incremented by the parent to request focus on the editor.
   * Initial value must be 0 to avoid focusing on mount.
   */
  focusRequestKey?: number;
  /** Whether the editor should use dark theme styling. */
  isDark: boolean;
  /** Called on every user-initiated content change. */
  onContentChange: (content: string) => void;
}

/** Imperative handle exposed to parent components via ref. */
export interface VditorFileEditorHandle {
  /**
   * Synchronously returns the current editor content and flushes any pending
   * change to `onContentChange`. Use before Cmd+S to ensure the saved content
   * matches the editor rather than a stale listener emission.
   */
  flushNow: () => string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Mounts a Vditor IR editor for a single file.
 *
 * The editor is created once on mount and destroyed on unmount. Remount is
 * driven by `key={path}` at the parent call site — this component does not
 * internally remount when `path` changes.
 *
 * Content sync follows a round-trip pattern:
 * - User edits flow through the Vditor `input` callback to `onContentChange`.
 * - External content changes are applied via `setValue` only when they
 *   genuinely differ from the last emitted markdown.
 * - `isDeleted` makes the editor read-only via `setReadOnly`.
 * - `setValue` does NOT re-fire the input callback, so the loop-guard is
 *   simple — but all guards are kept as belt-and-suspenders
 *   because Vditor input timing is render-based.
 *
 * Under React.StrictMode the mount effect is double-invoked on the same
 * root div; `vditorEditorRegistry` keeps one Vditor instance per root and
 * routes emissions to the currently-mounted instance.
 */

export const VditorFileEditor = forwardRef<VditorFileEditorHandle, VditorFileEditorProps>(function VditorFileEditor(
  { path, content, isDeleted, readOnly = false, focusRequestKey = 0, isDark, onContentChange },
  ref,
) {
  // Content width mirrors the preview's readable/full setting so the editor
  // and preview stay visually consistent (readable = 860px centered column).
  const markdownPreviewWidth = displaySettingsStore((state) => state.markdownPreviewWidth);
  // Markdown settings from the settings view drive the editor too:
  // - theme override (inherit/light/dark) forces the editor theme independently
  //   of the app theme, matching the preview behavior
  // - preview font size (small/medium/large) scales the editor base font size
  const markdownThemePreference = displaySettingsStore((state) => state.markdownThemePreference);
  const markdownPreviewFontSize = displaySettingsStore((state) => state.markdownPreviewFontSize);
  const resolvedIsDark = markdownThemePreference === "inherit" ? isDark : markdownThemePreference === "dark";
  // Vditor UI language (toolbar tooltips etc.) follows the app language. The
  // editor is created once per file open, so a language switch applies on the
  // next file open.
  const vditorLang = resolveVditorLang(i18n.language);
  const rootRef = useRef<HTMLDivElement>(null);
  // SVG markup for the shared diagram zoom overlay (opened from a mermaid
  // diagram's expand button).
  const [zoomDiagramSvg, setZoomDiagramSvg] = useState<string | null>(null);
  const handleRef = useRef<VditorEditorHandle | null>(null);
  const lastEmittedRef = useRef(content);
  const initialContentNormalizedRef = useRef(normalizeMarkdown(content));
  const hasEmittedRef = useRef(false);
  const isDeletedRef = useRef(isDeleted);
  const readOnlyRef = useRef(readOnly);
  const mountPathRef = useRef(path);
  const pendingFocusRef = useRef(0);

  // ── CRLF detection for EOL preservation ──

  const isCRLFRef = useRef(content.includes("\r\n"));

  // ── Latest-content ref ──

  const latestContentRef = useRef(content);

  // ── Keep mutable refs in sync ──

  useEffect(() => {
    isDeletedRef.current = isDeleted;
  }, [isDeleted]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  // ── Path guard ──

  useEffect(() => {
    if (path !== mountPathRef.current) {
      console.warn("[VditorFileEditor] path changed while mounted — key={path} should prevent this");
    }
  }, [path]);

  // ── Focus request ref ──

  const lastFocusKeyRef = useRef(0);

  // ── Handle-ready helper ──

  function onHandleReady(handle: VditorEditorHandle) {
    handleRef.current = handle;

    // Apply initial read-only state (F2: mount-with-isDeleted=true was missed)
    try {
      handle.setReadOnly(isDeletedRef.current || readOnlyRef.current);
    } catch (error: unknown) {
      console.error("[VditorFileEditor] setReadOnly on mount failed:", getErrorMessage(error));
    }

    // Retry pending focus request
    if (pendingFocusRef.current > 0) {
      const key = pendingFocusRef.current;
      pendingFocusRef.current = 0;
      requestAnimationFrame(() => {
        try {
          handle.focus();
        } catch (error: unknown) {
          console.error("[VditorFileEditor] pending focus retry failed:", getErrorMessage(error));
        }
      });
      // Prevent the focusRequestKey effect from also firing for the same key
      lastFocusKeyRef.current = key;
    }

    // Retry pending external content apply
    const latestContent = latestContentRef.current;
    if (shouldApplyExternalContent(lastEmittedRef.current, latestContent)) {
      handle.setValue(latestContent);
      lastEmittedRef.current = latestContent;
      initialContentNormalizedRef.current = normalizeMarkdown(latestContent);
    }
  }

  // ── Mount / unmount ──
  // This effect intentionally runs once on mount (remount is driven by
  // key={path} at the call site). Under React.StrictMode the effect is
  // double-invoked (mount → cleanup → mount) on the same root div. The
  // registry ensures only one Vditor instance per root div, shared across
  // StrictMode remounts.

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once effect — see comment above
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let destroyed = false;

    const emitContent = (nextMarkdown: string) => {
      if (destroyed || isDeletedRef.current || readOnlyRef.current) return;

      // F1: Gate the first-emission guard to the first emission only.
      if (!hasEmittedRef.current) {
        hasEmittedRef.current = true;
        if (normalizeMarkdown(nextMarkdown) === initialContentNormalizedRef.current) {
          return;
        }
      }

      // F4: Stale-emission guard — if a pending render-based emission fires
      // after the document has been superseded (e.g. by setValue), skip it.
      if (handleRef.current) {
        const currentFlush = handleRef.current.getValue();
        if (nextMarkdown !== currentFlush) return;
      }

      // EOL preservation
      const emitted = isCRLFRef.current ? nextMarkdown.replace(/\n/g, "\r\n") : nextMarkdown;

      lastEmittedRef.current = emitted;
      onContentChange(emitted);
    };

    const { promise, release } = acquireVditorEditor(
      root,
      { defaultValue: content, isDark: resolvedIsDark, lang: vditorLang },
      emitContent,
    );

    promise.then((handle) => {
      if (destroyed) return;
      onHandleReady(handle);
    });

    return () => {
      destroyed = true;
      release();
    };
  }, []);

  useVditorContentSync({ content, isDeletedRef, handleRef, lastEmittedRef, latestContentRef });
  useVditorTheme({ rootRef, handleRef, resolvedIsDark });

  // ── Read-only for deleted files or view-only mode ──

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    try {
      handle.setReadOnly(isDeleted || readOnly);
    } catch (error: unknown) {
      console.error("[VditorFileEditor] setReadOnly failed:", getErrorMessage(error));
    }
  }, [isDeleted, readOnly]);

  useVditorFocusRequest({ focusRequestKey, handleRef, pendingFocusRef, lastFocusKeyRef });

  // ── Imperative handle for parent ──

  useImperativeHandle(ref, () => ({
    flushNow(): string {
      const handle = handleRef.current;
      if (!handle) return content;

      const currentMarkdown = handle.getValue();
      if (currentMarkdown !== lastEmittedRef.current) {
        const emitted = isCRLFRef.current ? currentMarkdown.replace(/\n/g, "\r\n") : currentMarkdown;
        lastEmittedRef.current = emitted;
        onContentChange(emitted);
      }
      return currentMarkdown;
    },
  }));

  useVditorWindowInteractions({
    rootRef,
    isDeletedRef,
    onZoomDiagramSvg: setZoomDiagramSvg,
  });

  // ── Render ──

  return (
    <div
      ref={rootRef}
      className="vditor-app-editor"
      data-theme={resolvedIsDark ? "dark" : "light"}
      data-content-width={markdownPreviewWidth}
      data-font-size={markdownPreviewFontSize}
      data-view-only={isDeleted || readOnly}
    >
      {zoomDiagramSvg !== null && (
        <DiagramZoomOverlay svgContent={zoomDiagramSvg} onClose={() => setZoomDiagramSvg(null)} />
      )}
    </div>
  );
});
