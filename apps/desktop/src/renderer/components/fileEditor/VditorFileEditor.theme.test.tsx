/**
 * @vitest-environment jsdom
 *
 * Theme-related tests for VditorFileEditor.
 * Split from the main test file to keep both under the 500-line limit.
 */

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VditorFileEditor } from "./VditorFileEditor";

// ---------------------------------------------------------------------------
// Mock handle
// ---------------------------------------------------------------------------

const mockGetValue = vi.fn().mockReturnValue("# test");
const mockSetValue = vi.fn();
const mockDestroyImpl = vi.fn();
const mockSetReadOnly = vi.fn();
const mockFocus = vi.fn();
const mockSetTheme = vi.fn();

function createFakeHandle() {
  return {
    vditor: { setTheme: mockSetTheme } as unknown as Record<string, unknown>,
    getValue: mockGetValue,
    setValue: mockSetValue,
    flush: mockGetValue,
    destroy: mockDestroyImpl,
    setReadOnly: mockSetReadOnly,
    focus: mockFocus,
  };
}

// ---------------------------------------------------------------------------
// Module mock
// ---------------------------------------------------------------------------

let capturedCreationOptions: {
  defaultValue: string;
  isDark: boolean;
  onMarkdownChange: (markdown: string) => void;
} | null = null;

let onMarkdownChangeFromFactory: ((markdown: string) => void) | null = null;

vi.mock("./vditorEditor", () => ({
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

// ---------------------------------------------------------------------------
// Minimal required styles
// ---------------------------------------------------------------------------

function addEditorStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    .vditor-app-editor { min-height: 100px; }
  `;
  document.head.appendChild(style);
  return style;
}

// ---------------------------------------------------------------------------
// Test values
// ---------------------------------------------------------------------------

const HELLO = "# Hello";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VditorFileEditor theme", () => {
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

  it("calls createVditorEditor on mount with defaultValue=content and correct data-theme", async () => {
    const createEditorModule = await import("./vditorEditor");
    const mockCreate = createEditorModule.createVditorEditor as ReturnType<typeof vi.fn>;

    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={true} onContentChange={vi.fn()} />,
    );

    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.className).toBe("vditor-app-editor");
    expect(rootDiv.getAttribute("data-theme")).toBe("dark");
    // Content width mirrors the preview's readable/full setting.
    expect(rootDiv.getAttribute("data-content-width")).toBe("readable");

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    expect(capturedCreationOptions).toMatchObject({
      defaultValue: "# Hello",
      isDark: true,
    });
  });

  it("sets data-theme='light' when isDark is false", async () => {
    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={false} onContentChange={vi.fn()} />,
    );

    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.getAttribute("data-theme")).toBe("light");
  });

  it("calls vditor.setTheme on isDark change", async () => {
    const onContentChange = vi.fn();

    const { rerender } = render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    // Toggle to dark
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={true}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    mockSetTheme.mockClear();

    // Toggle back to light
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith("classic");
    });
  });
});
