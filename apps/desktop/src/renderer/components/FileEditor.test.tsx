// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAppTheme } from "../testUtils/renderWithAppTheme";
import { FileEditor } from "./FileEditor";

// Capture props passed to MarkdownPreview so tests can inspect findOpen etc.
const capturedMarkdownPreviewProps: { current: Record<string, unknown> } = { current: {} };
vi.mock("./markdown/MarkdownPreview", () => ({
  MarkdownPreview: (props: Record<string, unknown>) => {
    capturedMarkdownPreviewProps.current = props;
    return null;
  },
}));

const mockEditorState: {
  editorValue: string;
  editorFocus: () => void;
  editorFindAction: { run: () => void };
  addCommandCalls: Array<{ keybinding: number; handler: () => void }>;
  contentChangeListener: null | (() => void);
  disposeCount: number;
  createCount: number;
  createOptions: unknown;
  lastModelLanguage: string | undefined;
  lastModelUri: unknown;
} = {
  editorValue: "",
  editorFocus: vi.fn(),
  editorFindAction: { run: vi.fn() },
  addCommandCalls: [],
  contentChangeListener: null,
  disposeCount: 0,
  createCount: 0,
  createOptions: null,
  lastModelLanguage: undefined,
  lastModelUri: null,
};

vi.mock("../helpers/monacoSetup", () => ({
  YISHAN_THEME_DARK: "yishan-dark",
  YISHAN_THEME_LIGHT: "yishan-light",
  ensureEditorThemes: vi.fn(),
  monaco: {
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { KeyS: 49, Escape: 9 },
    Uri: {
      file: (path: string) => ({ scheme: "file", path }),
    },
    editor: {
      MouseTargetType: { GUTTER_LINE_DECORATIONS: 4, CONTENT_VIEW_ZONE: 8 },
      create: (container: HTMLElement, options: Record<string, unknown>) => {
        mockEditorState.createCount += 1;
        mockEditorState.createOptions = options;

        return {
          getValue: () => mockEditorState.editorValue,
          setValue: (value: string) => {
            mockEditorState.editorValue = value;
          },
          focus: () => mockEditorState.editorFocus(),
          layout: vi.fn(),
          getAction: (id: string) => (id === "actions.find" ? mockEditorState.editorFindAction : null),
          addCommand: (keybinding: number, handler: () => void) => {
            mockEditorState.addCommandCalls.push({ keybinding, handler });
          },
          onDidChangeModelContent: (listener: () => void) => {
            mockEditorState.contentChangeListener = listener;
            return { dispose: vi.fn() };
          },
          onMouseDown: () => ({ dispose: vi.fn() }),
          onKeyDown: () => ({ dispose: vi.fn() }),
          changeViewZones: vi.fn(),
          createDecorationsCollection: vi.fn(() => ({ set: vi.fn(), clear: vi.fn() })),
          dispose: () => {
            mockEditorState.disposeCount += 1;
          },
          updateOptions: vi.fn(),
        };
      },
      createModel: (value: string, language?: string, uri?: unknown) => {
        mockEditorState.editorValue = value;
        mockEditorState.lastModelLanguage = language;
        mockEditorState.lastModelUri = uri;
        return {
          setValue: (v: string) => {
            mockEditorState.editorValue = v;
          },
          dispose: vi.fn(),
        };
      },
      getModel: () => null,
      setModelLanguage: vi.fn(),
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
    },
  },
}));

// Mock the git commands used by useGitGutterDecorations
vi.mock("../commands/gitCommands", () => ({
  readDiff: vi.fn(() => Promise.resolve({ oldContent: "", newContent: "" })),
}));

vi.mock("../helpers/editorLanguage", () => ({
  getLanguageId: (path: string) => {
    if (path.endsWith(".unknown")) return null;
    if (path.endsWith(".ts")) return "typescript";
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".md") || path.endsWith(".mdx")) return "markdown";
    return "plaintext";
  },
  isMarkdownFile: (path: string) => {
    return path.endsWith(".md") || path.endsWith(".mdx");
  },
}));

vi.mock("./fileTreeIcons", () => ({
  getFileTreeIcon: (path: string) => `/icons/${path.split("/").pop()}.svg`,
}));

afterEach(() => {
  cleanup();
  capturedMarkdownPreviewProps.current = {};
  mockEditorState.editorValue = "";
  mockEditorState.editorFocus = vi.fn();
  mockEditorState.editorFindAction = { run: vi.fn() };
  mockEditorState.addCommandCalls = [];
  mockEditorState.contentChangeListener = null;
  mockEditorState.disposeCount = 0;
  mockEditorState.createCount = 0;
  mockEditorState.createOptions = null;
  mockEditorState.lastModelLanguage = undefined;
  mockEditorState.lastModelUri = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FileEditor", () => {
  it("creates a Monaco editor on mount", () => {
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

    expect(mockEditorState.createCount).toBe(1);
  });

  it("triggers save callback on Cmd+S binding", () => {
    const onSave = vi.fn();

    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" onSave={onSave} />);

    // Simulate the user editing the document after mount.
    mockEditorState.editorValue = "saved text";

    const saveCommand = mockEditorState.addCommandCalls.find((c) => c.keybinding === (2048 | 49));
    expect(saveCommand).toBeTruthy();
    saveCommand?.handler();

    expect(onSave).toHaveBeenCalledWith("saved text");
  });

  it("emits changed content through onContentChange", () => {
    const onContentChange = vi.fn();

    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" onContentChange={onContentChange} />);

    // Simulate the user editing the document after mount.
    mockEditorState.editorValue = "next text";

    expect(mockEditorState.contentChangeListener).toBeTruthy();
    mockEditorState.contentChangeListener?.();

    expect(onContentChange).toHaveBeenCalledWith("next text");
  });

  it("creates model with the correct language for supported files", () => {
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

    expect(mockEditorState.lastModelLanguage).toBe("typescript");
  });

  it("creates model without language for unsupported files", () => {
    renderWithAppTheme(<FileEditor path="data/file.unknown" content="initial" />);

    expect(mockEditorState.lastModelLanguage).toBeUndefined();
  });

  it("creates model with file:// URI matching the path", () => {
    renderWithAppTheme(<FileEditor path="/Users/dev/project/main.ts" content="initial" />);

    expect(mockEditorState.lastModelUri).toEqual({ scheme: "file", path: "/Users/dev/project/main.ts" });
  });

  it("uses dark theme when MUI theme is dark", () => {
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

    expect((mockEditorState.createOptions as { theme?: string })?.theme).toBe("yishan-dark");
  });

  it("uses light theme when MUI theme is light", () => {
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />, { mode: "light" });

    expect((mockEditorState.createOptions as { theme?: string })?.theme).toBe("yishan-light");
  });

  it("focuses the editor when requested", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { rerender } = renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" focusRequestKey={0} />);

    expect(mockEditorState.editorFocus).not.toHaveBeenCalled();

    rerender(<FileEditor path="src/a.ts" content="initial" focusRequestKey={1} />);

    expect(mockEditorState.editorFocus).toHaveBeenCalledTimes(1);
  });

  it("recreates editor when path changes", () => {
    const { rerender } = renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

    expect(mockEditorState.createCount).toBe(1);

    rerender(<FileEditor path="src/b.py" content="print('hi')" />);

    expect(mockEditorState.createCount).toBe(2);
    expect(mockEditorState.disposeCount).toBe(1);
  });

  it("displays the file path in the header", () => {
    const { getByText } = renderWithAppTheme(<FileEditor path="src/components/App.tsx" content="initial" />);

    expect(getByText("src/components/App.tsx")).toBeTruthy();
  });

  it("displays the file icon before the path in the header", () => {
    const { container } = renderWithAppTheme(<FileEditor path="src/components/App.tsx" content="initial" />);

    const icon = container.querySelector('img[src="/icons/App.tsx.svg"]');
    expect(icon).toBeTruthy();
  });

  it("runs file path header actions", () => {
    const onCopyPath = vi.fn();
    const onOpenExternalApp = vi.fn();
    const { getByRole } = renderWithAppTheme(
      <FileEditor
        path="src/components/App.tsx"
        content="initial"
        onCopyPath={onCopyPath}
        onOpenExternalApp={onOpenExternalApp}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Copy file path" }));
    fireEvent.click(getByRole("button", { name: "Open in external app" }));

    expect(onCopyPath).toHaveBeenCalledWith("src/components/App.tsx");
    expect(onOpenExternalApp).toHaveBeenCalledWith("src/components/App.tsx");
  });

  it("defaults markdown files to split mode", () => {
    renderWithAppTheme(<FileEditor path="README.md" content="# Hello" />);

    expect(screen.getByRole("button", { name: "Split view" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("respects configured markdown default mode", () => {
    renderWithAppTheme(<FileEditor path="README.md" content="# Hello" defaultMarkdownViewMode="preview" />);

    expect(screen.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe("true");
  });

  describe("preview find bar (Cmd+F)", () => {
    it("opens the find bar when Cmd+F is pressed in preview-only mode", () => {
      const { getByTestId } = renderWithAppTheme(
        <FileEditor path="README.md" content="# Hello" defaultMarkdownViewMode="preview" />,
      );

      // findOpen should start false
      expect(capturedMarkdownPreviewProps.current.findOpen).toBeFalsy();

      const previewPane = getByTestId("markdown-preview-pane");
      act(() => {
        fireEvent.keyDown(previewPane, { key: "f", metaKey: true });
      });

      expect(capturedMarkdownPreviewProps.current.findOpen).toBe(true);
    });

    it("does not open find bar on Cmd+F in split mode — triggers Monaco find instead", () => {
      const { getByTestId } = renderWithAppTheme(
        <FileEditor path="README.md" content="# Hello" defaultMarkdownViewMode="split" />,
      );

      const previewPane = getByTestId("markdown-preview-pane");
      act(() => {
        fireEvent.keyDown(previewPane, { key: "f", metaKey: true });
      });

      // find bar should NOT open in split mode
      expect(capturedMarkdownPreviewProps.current.findOpen).toBeFalsy();
      // editor focus + find action should have been called
      expect(mockEditorState.editorFocus).toHaveBeenCalled();
      expect(mockEditorState.editorFindAction.run).toHaveBeenCalled();
    });

    it("closes the find bar on Escape when it is open", () => {
      const { getByTestId } = renderWithAppTheme(
        <FileEditor path="README.md" content="# Hello" defaultMarkdownViewMode="preview" />,
      );

      const previewPane = getByTestId("markdown-preview-pane");

      // Open it first
      act(() => {
        fireEvent.keyDown(previewPane, { key: "f", metaKey: true });
      });
      expect(capturedMarkdownPreviewProps.current.findOpen).toBe(true);

      // Now close with Escape
      act(() => {
        fireEvent.keyDown(previewPane, { key: "Escape" });
      });
      expect(capturedMarkdownPreviewProps.current.findOpen).toBe(false);
    });
  });
});
