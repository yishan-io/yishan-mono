import { type VditorEditorHandle, type VditorLang, createVditorEditor } from "./vditorEditor";

/** Shared state for a single root div, reused across StrictMode remounts. */
interface RootEditorState {
  promise: Promise<VditorEditorHandle>;
  refCount: number;
}

const rootEditorStates = new WeakMap<HTMLElement, RootEditorState>();
const rootEmitters = new WeakMap<HTMLElement, (markdown: string) => void>();

export type VditorEditorOptions = {
  defaultValue: string;
  isDark: boolean;
  lang: VditorLang;
};

export type AcquiredVditorEditor = {
  /** Resolves to the shared editor handle once created. */
  promise: Promise<VditorEditorHandle>;
  /** Releases this mount's claim; destroys the editor when the last mount leaves. */
  release: () => void;
};

/**
 * Acquires the shared editor for one root div (get-or-create under
 * StrictMode remounts) and routes emissions to the currently-mounted
 * instance via `emitContent`.
 */
export function acquireVditorEditor(
  root: HTMLElement,
  options: VditorEditorOptions,
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
