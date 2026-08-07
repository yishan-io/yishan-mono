// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
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

// Capture props passed to MarkdownPreview so tests can inspect findOpen etc.
const capturedMarkdownPreviewProps: { current: Record<string, unknown> } = { current: {} };
vi.mock("./markdown/MarkdownPreview", () => ({
  MarkdownPreview: (props: Record<string, unknown>) => {
    const checkboxContainerRef = useRef<HTMLDivElement | null>(null);
    capturedMarkdownPreviewProps.current = props;

    useEffect(() => {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.testid = "markdown-preview-checkbox";
      checkbox.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        (props.onContentChange as ((content: string) => void) | undefined)?.("- [x] Done");
      });
      checkboxContainerRef.current?.append(checkbox);

      return () => {
        checkbox.remove();
      };
    }, [props.onContentChange]);

    return <div ref={checkboxContainerRef} />;
  },
}));

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

// Captured props and flushNow state for the VditorFileEditor mock
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
        (props.onContentChange as (content: string) => void)?.(mockFlushNowReturn || (props.content as string));
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
  capturedMarkdownPreviewProps.current = {};
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

describe("FileEditor WYSIWYG", () => {
  it("defaults markdown files to wysiwyg mode", async () => {
    renderWithAppTheme(<FileEditor path="README.md" content="# Hello" />);

    // The Vditor mock should be rendered (React.lazy may need a tick)
    await screen.findByTestId("vditor-editor");
    // Monaco should still be created (hidden)
    expect(mockEditorState.createCount).toBe(1);
  });

  it("respects configured markdown default mode", () => {
    renderWithAppTheme(<FileEditor path="README.md" content="# Hello" defaultMarkdownViewMode="preview" />);

    expect(screen.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("vditor-editor")).toBeNull();
  });

  describe("WYSIWYG mode", () => {
    it("renders Vditor for markdown files by default", async () => {
      renderWithAppTheme(<FileEditor path="README.md" content="# Hello" />);

      await screen.findByTestId("vditor-editor");
    });

    it("renders Monaco in source mode but not Vditor", () => {
      renderWithAppTheme(<FileEditor path="README.md" content="# Hello" defaultMarkdownViewMode="edit" />);

      expect(screen.queryByTestId("vditor-editor")).toBeNull();
      expect(mockEditorState.createCount).toBe(1);
    });

    it("does not render Vditor for non-markdown files", () => {
      renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

      expect(screen.queryByTestId("vditor-editor")).toBeNull();
    });

    it("calls flushNow on the Vditor handle before save in wysiwyg mode", async () => {
      const onSave = vi.fn();

      renderWithAppTheme(<FileEditor path="README.md" content="initial" onSave={onSave} />);

      // Wait for the lazy Vditor editor to mount so the handleRef is available
      // when the Cmd+S handler fires. Without this, React.lazy may not have
      // resolved the component yet and flushNow would be skipped.
      await screen.findByTestId("vditor-editor");

      // Set up the flush simulation
      mockFlushNowReturn = "wysiwyg content";
      mockEditorState.editorValue = "monaco content";

      // Simulate Cmd+S on the editor root
      const monacoDomNode = mockEditorState.editorDomNode;
      expect(monacoDomNode).toBeTruthy();
      fireEvent.keyDown(monacoDomNode as HTMLElement, { key: "s", metaKey: true });

      // flushNow should have been called
      expect(mockFlushNowCalled).toBe(true);
      // onSave must have been called with the flushed WYSIWYG content
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith("wysiwyg content");
    });

    it("stays in wysiwyg mode for markdown files when view mode toggled back", async () => {
      const { getByRole } = renderWithAppTheme(<FileEditor path="README.md" content="# Hello" />);

      // Default is wysiwyg — Vditor rendered
      expect(screen.getByTestId("vditor-editor")).toBeTruthy();

      // Switch to source mode
      fireEvent.click(getByRole("button", { name: "Source editor" }));
      expect(screen.queryByTestId("vditor-editor")).toBeNull();

      // Switch back to wysiwyg
      fireEvent.click(getByRole("button", { name: "WYSIWYG" }));
      expect(screen.getByTestId("vditor-editor")).toBeTruthy();
    });
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
