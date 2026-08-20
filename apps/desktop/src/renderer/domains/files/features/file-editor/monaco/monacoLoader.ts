/**
 * Lazy loader for `monacoSetup` (and, transitively, the full monaco-editor
 * ESM graph). The files domain index must never execute monaco at module
 * load; this module keeps the load behind a cached dynamic import so the
 * index stays cheap and tests that never mount a Monaco editor never pay
 * the monaco transform/execution cost.
 *
 * Type-only consumers import `import type * as MonacoNs from "monaco-editor"`
 * themselves (fully erased at runtime) and use `MonacoNs.editor.X` for types.
 */
let setupPromise: Promise<typeof import("./monacoSetup")> | undefined;

/**
 * Loads `monacoSetup` once and returns the cached promise. On rejection the
 * cache is cleared so a later mount retries (a cold-start transform error or
 * broken chunk must not permanently brick the editor).
 */
export function loadMonacoSetup(): Promise<typeof import("./monacoSetup")> {
  setupPromise ??= import("./monacoSetup").catch((error) => {
    setupPromise = undefined;
    throw error;
  });
  return setupPromise;
}
