/**
 * Test-only stub for `monaco-editor`. Vitest's transform cannot resolve the
 * package (ESM-only with worker entry points); the renderer reaches it through
 * the lazy `monacoLoader` (dynamic `import("./monacoSetup")`), so monacoSetup
 * only executes when a Monaco editor is actually mounted. The stub provides
 * the surfaces module graphs that import editor components need; tests that
 * exercise real monaco behavior declare their own richer `vi.mock("monaco-editor", ...)`,
 * which overrides this stub.
 */

const noop = () => undefined;

const typescriptDefaults = {
  setCompilerOptions: noop,
  setDiagnosticsOptions: noop,
};

const typescript = {
  typescriptDefaults,
  javascriptDefaults: typescriptDefaults,
  ScriptTarget: { ESNext: 99 },
  ModuleKind: { ESNext: 99 },
  ModuleResolutionKind: { NodeJs: 99 },
  JsxEmit: { ReactJSX: 99 },
  CompilerOptions: {},
};

export const languages = {
  typescript,
  register: noop,
  setMonarchTokensProvider: noop,
};

export const editor = {
  defineTheme: noop,
};

export const KeyCode = { Escape: 9 };
