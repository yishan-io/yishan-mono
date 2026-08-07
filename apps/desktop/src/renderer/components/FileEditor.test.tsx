// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createElement, forwardRef, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorSettingsStore } from "../store/settings/editorSettingsStore";
import { layoutStore } from "../store/settings/layoutStore";
import { renderWithAppTheme } from "../testUtils/renderWithAppTheme";
import { FileEditor } from "./FileEditor";

// Stub useMediaQuery so AppThemePreferenceProvider resolves themeMode
// deterministically. Default: no dark preference → system resolves to "light".
vi.mock("@mui/material", async () => {
  const actual = await vi.importActual("@mui/material");
  return { ...actual, useMediaQuery: vi.fn(() => false) };
});

const mockEditorState: {
  editorValue: string;
  editorFocus: () => void;
  editorFindAction: { run: () => void };
  contentChangeListener: null | (() => void);
  disposeCount: number;
  createCount: number;
  createOptions: unknown;
  lastModelLanguage: string | undefined;
  lastModelUri: unknown;
  editorSelections: Array<{
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }> | null;
  editorScrollPosition: { scrollTop: number; scrollLeft: number };
  editorDomNode: HTMLElement | null;
  updateOptionsCalls: Array<Record<string, unknown>>;
  setThemeCalls: string[];
} = {
  editorValue: "",
  editorFocus: vi.fn(),
  editorFindAction: { run: vi.fn() },
  contentChangeListener: null,
  disposeCount: 0,
  createCount: 0,
  createOptions: null,
  lastModelLanguage: undefined,
  lastModelUri: null,
  editorSelections: null,
  editorScrollPosition: { scrollTop: 0, scrollLeft: 0 },
  editorDomNode: null,
  updateOptionsCalls: [] as Array<Record<string, unknown>>,
  setThemeCalls: [] as string[],
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
        mockEditorState.editorDomNode = container;

        return {
          getValue: () => mockEditorState.editorValue,
          setValue: (value: string) => {
            mockEditorState.editorValue = value;
            mockEditorState.editorSelections = [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }];
            mockEditorState.editorScrollPosition = { scrollTop: 0, scrollLeft: 0 };
            mockEditorState.contentChangeListener?.();
          },
          getSelections: () => mockEditorState.editorSelections,
          setSelections: (selections: NonNullable<typeof mockEditorState.editorSelections>) => {
            mockEditorState.editorSelections = selections;
          },
          getScrollTop: () => mockEditorState.editorScrollPosition.scrollTop,
          getScrollLeft: () => mockEditorState.editorScrollPosition.scrollLeft,
          setScrollPosition: (position: typeof mockEditorState.editorScrollPosition) => {
            mockEditorState.editorScrollPosition = position;
          },
          getDomNode: () => mockEditorState.editorDomNode,
          focus: () => mockEditorState.editorFocus(),
          layout: vi.fn(),
          getAction: (id: string) => (id === "actions.find" ? mockEditorState.editorFindAction : null),
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
          updateOptions: (options: Record<string, unknown>) => {
            mockEditorState.updateOptionsCalls.push(options);
          },
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
      setTheme: (name: string) => {
        mockEditorState.setThemeCalls.push(name);
      },
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
  isExcalidrawFile: (path: string) => path.endsWith(".excalidraw"),
}));

const capturedExcalidrawProps: { current: Record<string, unknown> } = { current: {} };
vi.mock("./fileEditor/ExcalidrawFileEditor", () => ({
  default: (props: Record<string, unknown>) => {
    capturedExcalidrawProps.current = props;
    return <div data-testid="excalidraw-editor" />;
  },
}));

const capturedWysiwygProps: { current: Record<string, unknown> } = { current: {} };
let mockFlushNowReturn = "";
let mockFlushNowCalled = false;
vi.mock("./fileEditor/VditorFileEditor", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: mock ref type in test
  VditorFileEditor: forwardRef((props: Record<string, unknown>, ref: any) => {
    capturedWysiwygProps.current = props;

    useImperativeHandle(ref, () => ({
      flushNow: () => {
        mockFlushNowCalled = true;
        // Emit onContentChange to simulate the real flush behavior
        (props.onContentChange as ((content: string) => void) | undefined)?.(
          mockFlushNowReturn || (props.content as string),
        );
        return mockFlushNowReturn || (props.content as string);
      },
    }));

    return createElement("div", { "data-testid": "vditor-editor" });
  }),
}));

vi.mock("./fileTreeIcons", () => ({
  getFileTreeIcon: (path: string) => `/icons/${path.split("/").pop()}.svg`,
}));

afterEach(() => {
  cleanup();
  capturedExcalidrawProps.current = {};
  capturedWysiwygProps.current = {};
  mockFlushNowReturn = "";
  mockFlushNowCalled = false;
  mockEditorState.editorValue = "";
  mockEditorState.editorFocus = vi.fn();
  mockEditorState.editorFindAction = { run: vi.fn() };
  mockEditorState.contentChangeListener = null;
  mockEditorState.disposeCount = 0;
  mockEditorState.createCount = 0;
  mockEditorState.createOptions = null;
  mockEditorState.lastModelLanguage = undefined;
  mockEditorState.lastModelUri = null;
  mockEditorState.editorSelections = null;
  mockEditorState.editorScrollPosition = { scrollTop: 0, scrollLeft: 0 };
  mockEditorState.editorDomNode = null;
  mockEditorState.updateOptionsCalls = [];
  mockEditorState.setThemeCalls = [];
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  // Reset layout store to defaults between tests
  layoutStore.setState({ themePreference: "system" });
});

describe("FileEditor", () => {
  it("creates a Monaco editor on mount", () => {
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

    expect(mockEditorState.createCount).toBe(1);
  });

  it("saves via the root capture handler when Cmd+S is pressed on the editor", () => {
    const onSave = vi.fn();

    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" onSave={onSave} />);

    // Simulate the user editing the document after mount.
    mockEditorState.editorValue = "saved text";

    const monacoDomNode = mockEditorState.editorDomNode;
    expect(monacoDomNode).toBeTruthy();
    // Ctrl+S (Windows) — the .md test below covers Cmd+S (macOS).
    fireEvent.keyDown(monacoDomNode as HTMLElement, { key: "s", code: "KeyS", ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("saved text");
  });

  it("preserves Monaco selection and scroll position when content is synchronized", () => {
    const { rerender } = renderWithAppTheme(<FileEditor path="src/a.ts" content="first" />);
    const selection = { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 3 };
    const scrollPosition = { scrollTop: 96, scrollLeft: 12 };
    mockEditorState.editorSelections = [selection];
    mockEditorState.editorScrollPosition = scrollPosition;

    rerender(<FileEditor path="src/a.ts" content="updated" />);

    expect(mockEditorState.editorSelections).toEqual([selection]);
    expect(mockEditorState.editorScrollPosition).toEqual(scrollPosition);
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

  it("uses dark theme when app theme mode is dark", () => {
    layoutStore.setState({ themePreference: "dark" });

    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

    expect((mockEditorState.createOptions as { theme?: string })?.theme).toBe("yishan-dark");
  });

  it("uses light theme when app theme mode is light", () => {
    // layoutStore default is "system" + useMediaQuery → false = "light"
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />, { mode: "light" });

    expect((mockEditorState.createOptions as { theme?: string })?.theme).toBe("yishan-light");
  });

  it("updates theme/font/wrap without recreating the editor", () => {
    layoutStore.setState({ themePreference: "light" });
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);
    const createCountAfterMount = mockEditorState.createCount;
    expect(createCountAfterMount).toBeGreaterThan(0);

    act(() => {
      editorSettingsStore.setState({ editorFontSize: 15, wordWrap: false });
      layoutStore.setState({ themePreference: "dark" });
    });

    expect(mockEditorState.createCount).toBe(createCountAfterMount);
    expect(mockEditorState.updateOptionsCalls.at(-1)).toMatchObject({ fontSize: 15, wordWrap: "off" });
    expect(mockEditorState.setThemeCalls).toContain("yishan-dark");

    // Restore stores so later tests see defaults.
    layoutStore.setState({ themePreference: "system" });
    editorSettingsStore.setState({ editorFontSize: 13, wordWrap: true });
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

  describe("Excalidraw dispatch", () => {
    it("renders the Excalidraw editor for .excalidraw files", async () => {
      const { getByTestId } = renderWithAppTheme(
        <FileEditor path="scene.excalidraw" content='{"type":"excalidraw"}' />,
      );

      await waitFor(() => {
        expect(getByTestId("excalidraw-editor")).toBeTruthy();
      });

      expect(capturedExcalidrawProps.current.path).toBe("scene.excalidraw");
    });

    it("renders the Monaco editor for non-excalidraw files", () => {
      renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

      expect(mockEditorState.createCount).toBe(1);
    });
  });

  describe("markdown files", () => {
    it("renders the Vditor editor without creating a Monaco instance", async () => {
      renderWithAppTheme(<FileEditor path="README.md" content="# Hello" />);

      await waitFor(() => {
        expect(screen.getByTestId("vditor-editor")).toBeTruthy();
      });

      expect(mockEditorState.createCount).toBe(0);
    });

    it("saves markdown content on Cmd+S via the Vditor flush path", async () => {
      const onSave = vi.fn();

      renderWithAppTheme(<FileEditor path="README.md" content="initial" onSave={onSave} />);

      // Wait for the lazy Vditor editor so the handleRef is available when
      // the Cmd+S handler fires.
      await waitFor(() => {
        expect(screen.getByTestId("vditor-editor")).toBeTruthy();
      });

      mockFlushNowReturn = "flushed markdown";
      fireEvent.keyDown(screen.getByTestId("vditor-editor"), { key: "s", metaKey: true });

      expect(mockFlushNowCalled).toBe(true);
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith("flushed markdown");
    });

    it("does not save deleted markdown content on Cmd+S", async () => {
      const onSave = vi.fn();

      renderWithAppTheme(<FileEditor path="README.md" content="# Hello" isDeleted onSave={onSave} />);

      await waitFor(() => {
        expect(screen.getByTestId("vditor-editor")).toBeTruthy();
      });

      fireEvent.keyDown(screen.getByTestId("vditor-editor"), { key: "s", metaKey: true });

      expect(mockFlushNowCalled).toBe(false);
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
