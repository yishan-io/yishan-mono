import { createVditorEditor } from "./vditorEditor";
import type { AcquiredVditorEditor, VditorEditorHandle, VditorLang } from "./vditorEditorTypes";

interface VditorRegistryOptions {
  defaultValue: string;
  isDark: boolean;
  lang: VditorLang;
  placeholder?: string;
}

/** Shared state for a single root div, reused across StrictMode remounts. */
interface RootEditorState {
  promise: Promise<VditorEditorHandle>;
  refCount: number;
}

const rootEditorStates = new WeakMap<HTMLElement, RootEditorState>();
const rootEmitters = new WeakMap<HTMLElement, (markdown: string) => void>();

/**
 * Acquires the shared editor for one root div (get-or-create under
 * StrictMode remounts) and routes emissions to the currently-mounted
 * instance via `emitContent`.
 */
export function acquireVditorEditor(
  root: HTMLElement,
  options: VditorRegistryOptions,
  emitContent: (markdown: string) => void,
): AcquiredVditorEditor {
  rootEmitters.set(root, emitContent);

  let state = rootEditorStates.get(root);
  if (!state) {
    state = {
      promise: createVditorEditor(root, {
        defaultValue: options.defaultValue,
        isDark: options.isDark,
        lang: options.lang,
        placeholder: options.placeholder,
        onMarkdownChange: (md) => rootEmitters.get(root)?.(md),
      }),
      refCount: 0,
    };
    rootEditorStates.set(root, state);
  }
  state.refCount += 1;

  const promise = state.promise;

  let destroyed = false;
  const release = () => {
    if (destroyed) return;
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

    // Last mount leaving — destroy the editor once the promise resolves
    void currentState.promise.then((handle) => {
      if (currentState.refCount === 0) {
        handle.destroy();
        rootEditorStates.delete(root);
      }
    });
  };

  return { promise, release };
}
