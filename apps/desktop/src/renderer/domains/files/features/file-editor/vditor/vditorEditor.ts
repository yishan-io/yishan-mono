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
import type { VditorEditorHandle, VditorEditorOptions } from "./vditorEditorTypes";

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
        placeholder: options.placeholder,
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
