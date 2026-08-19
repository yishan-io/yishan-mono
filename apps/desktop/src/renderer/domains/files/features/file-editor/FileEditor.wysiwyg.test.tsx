// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { displaySettingsStore } from "../../../../domains/settings/state/displaySettingsStore";
import { editorSettingsStore } from "../../../../domains/settings/state/editorSettingsStore";
import { i18n } from "../../../../i18n";
import { renderWithAppTheme } from "../../../../testUtils/renderWithAppTheme";
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

vi.mock("../../infrastructure/monacoSetup", () => ({
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

vi.mock("../../model/editorLanguage", () => ({
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

vi.mock("../../../../domains/git/commands/gitCommands", () => ({
  readDiff: vi.fn(() => Promise.resolve({ oldContent: "", newContent: "" })),
}));

const capturedExcalidrawProps: { current: Record<string, unknown> } = { current: {} };
vi.mock("./ExcalidrawFileEditor", () => ({
  default: (props: Record<string, unknown>) => {
    capturedExcalidrawProps.current = props;
    return <div data-testid="excalidraw-editor" />;
  },
}));

// Captured props and flushNow state for the VditorFileEditor mock
const capturedWysiwygProps: { current: Record<string, unknown> } = { current: {} };
let mockFlushNowReturn = "";
let mockFlushNowCalled = false;
vi.mock("./VditorFileEditor", () => ({
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

vi.mock("../../ui/fileTreeIcons", () => ({
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
  displaySettingsStore.setState({ themePreference: "system" });
});

describe("FileEditor WYSIWYG (markdown always uses the Vditor editor)", () => {
  beforeEach(async () => {
    // Ensure translated labels resolve (e.g. the view-only toggle).
    await i18n.changeLanguage("en");
  });

  it("renders the Vditor editor for markdown files without creating Monaco", async () => {
    renderWithAppTheme(<FileEditor path="README.md" content="# Hello" />);

    // The Vditor mock should be rendered (React.lazy may need a tick)
    await screen.findByTestId("vditor-editor");
    // No Monaco instance is created for markdown files anymore
    expect(mockEditorState.createCount).toBe(0);
  });

  it("does not render Vditor for non-markdown files", () => {
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

    expect(screen.queryByTestId("vditor-editor")).toBeNull();
    expect(mockEditorState.createCount).toBe(1);
  });

  it("calls flushNow on the Vditor handle before save", async () => {
    const onSave = vi.fn();

    renderWithAppTheme(<FileEditor path="README.md" content="initial" onSave={onSave} />);

    // Wait for the lazy Vditor editor to mount so the handleRef is available
    // when the Cmd+S handler fires.
    await screen.findByTestId("vditor-editor");

    // Set up the flush simulation
    mockFlushNowReturn = "wysiwyg content";

    // Simulate Cmd+S inside the editor root
    fireEvent.keyDown(screen.getByTestId("vditor-editor"), { key: "s", metaKey: true });

    // flushNow should have been called and the save must use the flushed content
    expect(mockFlushNowCalled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("wysiwyg content");
  });

  it("keeps the Vditor editor mounted when the markdown content changes", async () => {
    const { rerender } = renderWithAppTheme(<FileEditor path="README.md" content="# Hello" />);

    await screen.findByTestId("vditor-editor");

    rerender(<FileEditor path="README.md" content="# Updated" />);

    expect(screen.getByTestId("vditor-editor")).toBeTruthy();
    expect(mockEditorState.createCount).toBe(0);
  });

  it("toggles the Vditor editor into view-only mode from the toolbar", async () => {
    renderWithAppTheme(<FileEditor path="README.md" content="# Hello" />);

    await screen.findByTestId("vditor-editor");
    expect(capturedWysiwygProps.current.readOnly).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "View only" }));

    expect(capturedWysiwygProps.current.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: "Edit" }).getAttribute("aria-pressed")).toBe("true");

    // Toggle back to editing
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(capturedWysiwygProps.current.readOnly).toBe(false);
  });

  it("does not render the view-only toggle for non-markdown files", () => {
    renderWithAppTheme(<FileEditor path="src/a.ts" content="initial" />);

    expect(screen.queryByRole("button", { name: "View only" })).toBeNull();
  });
});
