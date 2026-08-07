/**
 * @vitest-environment jsdom
 *
 * View-only (readOnly prop) tests for VditorFileEditor.
 * Split from the lifecycle test file to keep both under the 500-line limit.
 */
import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VditorFileEditor } from "./VditorFileEditor";

// Mock handle (duplicated per test file — test-specific state)
const mockGetValue = vi.fn().mockReturnValue("# test");
const mockSetValue = vi.fn();
const mockDestroyImpl = vi.fn();
const mockSetReadOnly = vi.fn();
const mockFocus = vi.fn();

function createFakeHandle() {
  return {
    vditor: {} as Record<string, unknown>,
    getValue: mockGetValue,
    setValue: mockSetValue,
    flush: mockGetValue,
    destroy: mockDestroyImpl,
    setReadOnly: mockSetReadOnly,
    focus: mockFocus,
  };
}

// Module mock

let capturedCreationOptions: {
  defaultValue: string;
  isDark: boolean;
  onMarkdownChange: (markdown: string) => void;
} | null = null;

let onMarkdownChangeFromFactory: ((markdown: string) => void) | null = null;

vi.mock("./vditorEditor", () => ({
  resolveVditorLang: (lang?: string) => (lang?.toLowerCase().startsWith("zh") ? "zh_CN" : "en_US"),
  createVditorEditor: vi.fn().mockImplementation(
    (
      _root: HTMLElement,
      options: {
        defaultValue: string;
        isDark: boolean;
        onMarkdownChange: (markdown: string) => void;
      },
    ) => {
      capturedCreationOptions = options;
      onMarkdownChangeFromFactory = options.onMarkdownChange;
      return Promise.resolve(createFakeHandle());
    },
  ),
}));

// Minimal required styles

function addEditorStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    .vditor-app-editor { min-height: 100px; }
  `;
  document.head.appendChild(style);
  return style;
}

// Test values

const HELLO = "# Hello";
const HELLO_WORLD = "# Hello\n\nWorld";

// View-only tests

describe("VditorFileEditor view-only", () => {
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCreationOptions = null;
    onMarkdownChangeFromFactory = null;
    mockGetValue.mockReturnValue("# test");
    styleEl = addEditorStyles();
  });

  afterEach(() => {
    styleEl.remove();
  });

  it("applies setReadOnly(true) when mounted with readOnly=true", async () => {
    render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        readOnly={true}
        isDark={false}
        onContentChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockSetReadOnly).toHaveBeenCalledWith(true);
    });
  });

  it("toggles setReadOnly when the readOnly prop changes", async () => {
    const { rerender } = render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        readOnly={false}
        isDark={false}
        onContentChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });
    mockSetReadOnly.mockClear();

    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        readOnly={true}
        isDark={false}
        onContentChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockSetReadOnly).toHaveBeenCalledWith(true);
    });

    mockSetReadOnly.mockClear();
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        readOnly={false}
        isDark={false}
        onContentChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockSetReadOnly).toHaveBeenCalledWith(false);
    });
  });

  it("suppresses emissions while view-only (readOnly=true)", async () => {
    const onContentChange = vi.fn();

    render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        readOnly={true}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    mockGetValue.mockReturnValue(HELLO);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO);
    });

    expect(onContentChange).not.toHaveBeenCalled();
  });

  it("applies external content while view-only (readOnly does not block sync)", async () => {
    const onContentChange = vi.fn();

    const { rerender } = render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        readOnly={true}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO_WORLD}
        isDeleted={false}
        readOnly={true}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    // External content applies in view-only mode so the view stays current.
    expect(mockSetValue).toHaveBeenCalledWith(HELLO_WORLD);
  });

  it("sets data-view-only from isDeleted or readOnly (hides the toolbar)", async () => {
    const { container, rerender } = render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        readOnly={false}
        isDark={false}
        onContentChange={vi.fn()}
      />,
    );

    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.getAttribute("data-view-only")).toBe("false");

    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        readOnly={true}
        isDark={false}
        onContentChange={vi.fn()}
      />,
    );
    expect(rootDiv.getAttribute("data-view-only")).toBe("true");

    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={true}
        readOnly={false}
        isDark={false}
        onContentChange={vi.fn()}
      />,
    );
    expect(rootDiv.getAttribute("data-view-only")).toBe("true");
  });
});
