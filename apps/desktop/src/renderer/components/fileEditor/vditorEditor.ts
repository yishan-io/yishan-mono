/**
 * Imperative Vditor editor factory.
 *
 * Creates a configured IR-mode Vditor editor scoped to a given root DOM element.
 * Emits markdown changes via a callback and provides getValue/setValue/destroy
 * actions for the React wrapper layer.
 *
 * Imported lazily — no bundler overhead for non-WYSIWYG code paths.
 */

import Vditor from "vditor";
import luteUrl from "vditor/dist/js/lute/lute.min.js?url";
import { getErrorMessage } from "../../helpers/errorHelpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VditorEditorOptions {
  /** Initial markdown content to load into the editor. */
  defaultValue: string;
  /** Whether the editor should use dark theme. */
  isDark: boolean;
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
        toolbar: [],
        theme: options.isDark ? "dark" : "classic",
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
