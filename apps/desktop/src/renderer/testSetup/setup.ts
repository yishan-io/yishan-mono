/**
 * Global test setup.
 *
 * `monaco-editor` is stubbed via `resolve.alias` in vite.config.ts (test/dev
 * only) because vitest's transform cannot resolve the ESM-only package. No
 * module-level mock is needed here.
 */
// Several ESM-only packages (xterm addons, monaco) carry UMD wrappers that
// reference `self`. Node-environment tests have no `self`; provide it.
if (typeof globalThis.self === "undefined") {
  // @ts-expect-error jsdom-style global shim
  globalThis.self = globalThis;
}

export {};
