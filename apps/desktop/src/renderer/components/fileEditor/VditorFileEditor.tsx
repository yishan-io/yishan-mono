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

import { DiagramZoomOverlay } from "@renderer/components/DiagramZoomOverlay";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type Vditor from "vditor";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { i18n } from "../../i18n";
import { layoutStore } from "../../store/settings/layoutStore";
import { normalizeMarkdown, shouldApplyExternalContent } from "./editorContentSync";
import { attachMermaidZoomButtons, rethemeMermaidDiagrams } from "./mermaidZoomButton";
import { type VditorEditorHandle, createVditorEditor, resolveVditorLang } from "./vditorEditor";
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
 */
// ---------------------------------------------------------------------------
// Module-level shared editor state (one Vditor instance per root div)
// ---------------------------------------------------------------------------

/** Shared state for a single root div, reused across StrictMode remounts. */
interface RootEditorState {
  promise: Promise<VditorEditorHandle>;
  refCount: number;
  destroyPending: boolean;
}

const rootEditorStates = new WeakMap<HTMLElement, RootEditorState>();
const rootEmitters = new WeakMap<HTMLElement, (markdown: string) => void>();

export const VditorFileEditor = forwardRef<VditorFileEditorHandle, VditorFileEditorProps>(function VditorFileEditor(
  { path, content, isDeleted, readOnly = false, focusRequestKey = 0, isDark, onContentChange },
  ref,
) {
  // Content width mirrors the preview's readable/full setting so the editor
  // and preview stay visually consistent (readable = 860px centered column).
  const markdownPreviewWidth = layoutStore((state) => state.markdownPreviewWidth);
  // Markdown settings from the settings view drive the editor too:
  // - theme override (inherit/light/dark) forces the editor theme independently
  //   of the app theme, matching the preview behavior
  // - preview font size (small/medium/large) scales the editor base font size
  const markdownThemePreference = layoutStore((state) => state.markdownThemePreference);
  const markdownPreviewFontSize = layoutStore((state) => state.markdownPreviewFontSize);
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
  // double-invoked (mount → cleanup → mount) on the same root div.
  // A module-level WeakMap ensures only one Vditor instance is created
  // per root div, shared across StrictMode remounts. Emissions are routed
  // to the currently-mounted instance via rootEmitters.

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

    // Route emissions to this mount's emitContent
    rootEmitters.set(root, emitContent);

    // Get-or-create shared editor state for this root div
    let state = rootEditorStates.get(root);
    if (!state) {
      state = {
        promise: createVditorEditor(root, {
          defaultValue: content,
          isDark: resolvedIsDark,
          lang: vditorLang,
          onMarkdownChange: (md) => rootEmitters.get(root)?.(md),
        }),
        refCount: 0,
        destroyPending: false,
      };
      rootEditorStates.set(root, state);
    }
    state.refCount += 1;
    state.destroyPending = false;

    state.promise.then((handle) => {
      if (destroyed) return;
      onHandleReady(handle);
    });

    return () => {
      destroyed = true;

      // Remove this mount's emitter if it is still the current one
      if (rootEmitters.get(root) === emitContent) {
        rootEmitters.delete(root);
      }

      const currentState = rootEditorStates.get(root);
      if (!currentState) return;

      currentState.refCount -= 1;
      if (currentState.refCount > 0) {
        // Another mount still owns this root — leave the editor alive
        return;
      }

      // Last mount leaving — destroy the editor
      const handle = handleRef.current;
      handleRef.current = null;
      if (handle) {
        handle.destroy();
        rootEditorStates.delete(root);
      } else {
        currentState.destroyPending = true;
        currentState.promise.then((h) => {
          if (currentState.refCount === 0) {
            h.destroy();
            rootEditorStates.delete(root);
          }
        });
      }
    };
  }, []);

  // ── External content sync ──

  useEffect(() => {
    latestContentRef.current = content;

    const handle = handleRef.current;
    if (!handle) return;
    if (isDeletedRef.current) return;
    if (!shouldApplyExternalContent(lastEmittedRef.current, content)) return;

    handle.setValue(content);
    // setValue does NOT re-fire the input callback, but we reconcile
    // lastEmittedRef here for correct comparison on the next external change.
    lastEmittedRef.current = content;
  }, [content]);

  // ── Dark / light theme ──
  // Follows the resolved theme: the app theme, unless the settings view's
  // markdown theme override (inherit/light/dark) forces one. Vditor's own
  // theme is set at construction (classic/dark). The root data-theme
  // attribute drives CSS custom-property overrides in vditorTheme.css, which
  // are authoritative for the app's design tokens. Vditor's setTheme only
  // toggles the vditor--dark class and swaps the hljs stylesheet, so on an
  // actual theme change we also re-render already-rendered mermaid diagrams
  // with the new palette (their SVGs keep the original colors otherwise).

  const prevIsDarkRef = useRef(resolvedIsDark);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.setAttribute("data-theme", resolvedIsDark ? "dark" : "light");
    // Swap both vditor's shell theme and its syntax-highlight stylesheet
    // (github / github-dark) so existing code blocks re-color immediately.
    handleRef.current?.vditor.setTheme(
      resolvedIsDark ? "dark" : "classic",
      undefined,
      resolvedIsDark ? "github-dark" : "github",
    );

    const themeChanged = prevIsDarkRef.current !== resolvedIsDark;
    prevIsDarkRef.current = resolvedIsDark;
    if (themeChanged) {
      void rethemeMermaidDiagrams(root, {
        isDark: resolvedIsDark,
        fontFamily: getComputedStyle(root).fontFamily,
        onError: (message) => console.error("[VditorFileEditor] mermaid re-theme failed:", message),
      });
    }
  }, [resolvedIsDark]);

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

  // ── Focus request ──

  useEffect(() => {
    if (focusRequestKey <= 0) return;
    if (focusRequestKey === lastFocusKeyRef.current) return;
    lastFocusKeyRef.current = focusRequestKey;

    const handle = handleRef.current;
    if (!handle) {
      pendingFocusRef.current = focusRequestKey;
      return;
    }

    const frame = requestAnimationFrame(() => {
      try {
        handle.focus();
      } catch (error: unknown) {
        console.error("[VditorFileEditor] focus failed:", getErrorMessage(error));
      }
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focusRequestKey]);

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

  // ── Select-all (Cmd/Ctrl+A) ──
  // Chromium's native select-all in Vditor's IR contenteditable only selects
  // the current block (~15 chars); the selection gets clamped at rendered code
  // blocks (e.g. mermaid SVG previews). Intercept at the WINDOW CAPTURE phase
  // (the earliest renderer hook — runs before Vditor's own handlers, React's
  // delegation, and any ancestor bubble-phase stoppers; it also catches the
  // synthetic keydown Electron's `webContents.selectAll()` menu-role path
  // delivers) and select the whole IR content explicitly. The full range
  // highlights everything and Vditor's own copy handler converts the selection
  // back to markdown correctly.

  useEffect(() => {
    const handleSelectAll = (event: KeyboardEvent) => {
      if (isDeletedRef.current) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "a") return;

      const root = rootRef.current;
      if (!root) return;
      // Only act when the key originates inside this editor — don't hijack
      // Cmd+A while the file tree or other surfaces have focus.
      if (!(event.target instanceof Node) || !root.contains(event.target)) return;

      event.preventDefault();
      const pre = root.querySelector(".vditor-ir pre.vditor-reset");
      if (!pre) return;

      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    window.addEventListener("keydown", handleSelectAll, true);
    return () => {
      window.removeEventListener("keydown", handleSelectAll, true);
    };
  }, []);

  // ── Mermaid zoom button ──
  // Vditor renders mermaid code blocks into preview panels inside its own DOM;
  // watch for those panels and attach a hover-revealed expand button that opens
  // the shared pan/zoom overlay with the rendered SVG (same affordance as the
  // markdown preview pane).

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    return attachMermaidZoomButtons(root, (svgContent) => setZoomDiagramSvg(svgContent));
  }, []);

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
