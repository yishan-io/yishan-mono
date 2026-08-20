import { describe, expect, it, vi } from "vitest";
const typescriptDefaults = {
  setCompilerOptions: vi.fn(),
  setDiagnosticsOptions: vi.fn(),
};
const javascriptDefaults = {
  setCompilerOptions: vi.fn(),
  setDiagnosticsOptions: vi.fn(),
};

const workerMock = vi.fn();

vi.stubGlobal("Worker", workerMock);
vi.stubGlobal("self", globalThis);

vi.mock("monaco-editor", () => ({
  languages: {
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    typescript: {
      typescriptDefaults,
      javascriptDefaults,
      ScriptTarget: { ESNext: 99 },
      ModuleKind: { ESNext: 99 },
      ModuleResolutionKind: { NodeJs: 2 },
      JsxEmit: { ReactJSX: 4 },
    },
  },
  editor: {
    defineTheme: vi.fn(),
  },
}));
vi.mock("monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution", () => ({}));
vi.mock("monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution", () => ({}));

describe("monacoSetup", () => {
  it("configures TypeScript and JavaScript services for JSX/TSX", async () => {
    await import("./monacoSetup");

    expect(typescriptDefaults.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowJs: true,
        allowNonTsExtensions: true,
        jsx: 4,
      }),
    );
    expect(javascriptDefaults.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowJs: true,
        allowNonTsExtensions: true,
        jsx: 4,
      }),
    );
  });

  it("routes TypeScript and JavaScript language modes through the TypeScript worker", async () => {
    await import("./monacoSetup");

    const environment = self.MonacoEnvironment as { getWorker: (workerId: string, label: string) => unknown };
    environment.getWorker("1", "typescript");
    environment.getWorker("2", "javascript");

    expect(workerMock).toHaveBeenCalledTimes(2);
    expect(workerMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pathname: expect.stringContaining("ts.worker") }),
      { type: "module" },
    );
    expect(workerMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pathname: expect.stringContaining("ts.worker") }),
      { type: "module" },
    );
  });

  it("registers themes with default catch-all and regexp rules", async () => {
    const monaco = await import("monaco-editor");
    const { ensureEditorThemes } = await import("./monacoSetup");
    ensureEditorThemes();

    const defineThemeMock = monaco.editor.defineTheme as ReturnType<typeof vi.fn>;
    const yishanDarkCall = defineThemeMock.mock.calls.find((call: unknown[]) => call[0] === "yishan-dark");
    expect(yishanDarkCall).toBeDefined();
    const rules = (yishanDarkCall?.[1] as { rules: unknown[] }).rules;
    const defaultRule = (rules as Array<{ token: string; foreground?: string }>).find((r) => r.token === "");
    const regexpRule = (rules as Array<{ token: string; foreground?: string }>).find((r) => r.token === "regexp");
    // Dark yishan palette: foreground #d4dbe8, string #a7d56d (hex without "#" in Monaco rules).
    expect(defaultRule?.foreground).toBe("d4dbe8");
    expect(regexpRule?.foreground).toBe("a7d56d");
    const themeDefinition = yishanDarkCall?.[1] as { base: string; inherit: boolean };
    expect(themeDefinition.base).toBe("vs-dark");
    expect(themeDefinition.inherit).toBe(true);
  });
});
