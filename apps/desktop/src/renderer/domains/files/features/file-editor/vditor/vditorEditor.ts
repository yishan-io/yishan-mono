/**
 * Imperative Vditor editor factory.
 *
 * Creates a configured IR-mode Vditor editor scoped to a given root DOM element.
 * Emits markdown changes via a callback and provides getValue/setValue/destroy
 * actions for the React wrapper layer.
 *
 * Imported lazily — no bundler overhead for non-WYSIWYG code paths.
 */

import { getErrorMessage } from "@shared/errors/getErrorMessage";
import Vditor from "vditor";
import luteUrl from "vditor/dist/js/lute/lute.min.js?url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Languages Vditor ships built-in i18n for (toolbar tooltips etc.). */
export type VditorLang =
  | "de_DE"
  | "en_US"
  | "es_ES"
  | "fr_FR"
  | "ja_JP"
  | "ko_KR"
  | "pt_BR"
  | "ru_RU"
  | "sv_SE"
  | "vi_VN"
  | "zh_CN"
  | "zh_TW";

/**
 * Maps the app's runtime language ("en", "zh", …) to a Vditor i18n code.
 * Falls back to en_US for unsupported languages.
 */
export function resolveVditorLang(appLanguage: string | undefined): VditorLang {
  const base = appLanguage?.split(/[-_]/)[0]?.toLowerCase();
  if (base === "zh") {
    return "zh_CN";
  }
  if (base === "de") {
    return "de_DE";
  }
  if (base === "es") {
    return "es_ES";
  }
  if (base === "fr") {
    return "fr_FR";
  }
  if (base === "ja") {
    return "ja_JP";
  }
  if (base === "ko") {
    return "ko_KR";
  }
  if (base === "pt") {
    return "pt_BR";
  }
  if (base === "ru") {
    return "ru_RU";
  }
  if (base === "sv") {
    return "sv_SE";
  }
  if (base === "vi") {
    return "vi_VN";
  }
  return "en_US";
}

export interface VditorEditorOptions {
  /** Initial markdown content to load into the editor. */
  defaultValue: string;
  /** Whether the editor should use dark theme. */
  isDark: boolean;
  /** Vditor UI language (toolbar tooltips, hints). Defaults to en_US. */
  lang?: VditorLang;
  /** Called on every user edit with the current markdown string. */
  onMarkdownChange: (markdown: string) => void;
}

export interface VditorEditorHandle {
  /** The underlying Vditor instance. */
  vditor: Vditor;
  /** Returns the current markdown content. */
  getValue(): string;
  /** Replaces the editor content without re-firing the input callback. */
  setValue(markdown: string): void;
  /** Synchronously returns current markdown (alias for getValue). */
  flush(): string;
  /** Destroys the editor and cleans up all resources. */
  destroy(): void;
  /** Enables or disables read-only mode. */
  setReadOnly(readOnly: boolean): void;
  /** Focuses the editor. */
  focus(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Vditor IR editor attached to the given root DOM element.
 *
 * The editor is configured with IR mode, no toolbar, no cache, and lute
 * loaded from a local asset (via `_lutePath`).
 *
 * @param root - The DOM element to mount the editor into.
 * @param options - Editor configuration.
 * @returns A promise that resolves with an editor handle when lute is ready.
 */
export function createVditorEditor(root: HTMLElement, options: VditorEditorOptions): Promise<VditorEditorHandle> {
  let isReadOnly = false;

  return new Promise<VditorEditorHandle>((resolve, reject) => {
    try {
      const vditor = new Vditor(root, {
        mode: "ir",
        height: "100%",
        cache: { enable: false },
        // Local base for Vditor's runtime assets (icons, i18n, hljs, mermaid) —
        // copied into the public dir by the vite plugin, so the editor works
        // offline / behind blocked CDNs (lute is already local via _lutePath).
        cdn: "./vditor",
        lang: options.lang ?? "en_US",
        // Curated formatting toolbar (hidden in view-only mode via the
        // [data-view-only] CSS rule in vditorTheme.css).
        toolbar: [
          "undo",
          "redo",
          "|",
          "headings",
          "bold",
          "italic",
          "strike",
          "|",
          "list",
          "ordered-list",
          "check",
          "|",
          "quote",
          "code",
          "inline-code",
          "link",
          "table",
        ],
        theme: options.isDark ? "dark" : "classic",
        // Syntax-highlight theme follows the editor theme: vditor's default
        // (github) is a LIGHT palette whose tokens are unreadable on the dark
        // code surface.
        preview: {
          hljs: {
            style: options.isDark ? "github-dark" : "github",
          },
        },
        value: options.defaultValue,
        _lutePath: luteUrl,
        input(markdown: string): void {
          options.onMarkdownChange(markdown);
        },
        after(): void {
          resolve({
            vditor,
            getValue(): string {
              return vditor.getValue();
            },
            setValue(markdown: string): void {
              vditor.setValue(markdown, false);
            },
            flush(): string {
              return vditor.getValue();
            },
            destroy(): void {
              vditor.destroy();
            },
            setReadOnly(readOnly: boolean): void {
              if (readOnly === isReadOnly) return;
              isReadOnly = readOnly;
              if (readOnly) {
                vditor.disabled();
              } else {
                vditor.enable();
              }
            },
            focus(): void {
              vditor.focus();
            },
          });
        },
      });
    } catch (error: unknown) {
      reject(new Error(getErrorMessage(error)));
    }
  });
}
