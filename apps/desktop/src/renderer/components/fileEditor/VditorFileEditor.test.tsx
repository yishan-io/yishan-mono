/**
 * @vitest-environment jsdom
 */

import { render, waitFor } from "@testing-library/react";
import { act } from "react";
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
const HELLO_TRAILING = "# Hello\n";
const HELLO_WORLD = "# Hello\n\nWorld";
const HELLO_WORLD_TRAILING = "# Hello\n\nWorld\n";
const ORIGINAL = "# Original";
const ORIGINAL_EDITED = "# Original\n\nEdited";
const EXTERNAL = "# External change";
const SHOULD_NOT_FIRE = "# Hello\n\nShould not fire";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VditorFileEditor", () => {
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

  // ── Mount ──
  // ── Change emission ──

  it("forwards user edits to onContentChange", async () => {
    const onContentChange = vi.fn();

    render(
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

    // Simulate user edit through the factory listener
    mockGetValue.mockReturnValue(HELLO_WORLD);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_WORLD);
    });

    expect(onContentChange).toHaveBeenCalledWith(HELLO_WORLD);
  });

  it("does NOT forward the first emission when normalized markdown matches initial content", async () => {
    const onContentChange = vi.fn();

    render(
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

    // First emission: normalized-equal to initial → suppressed
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_TRAILING);
    });

    expect(onContentChange).not.toHaveBeenCalled();
  });

  // ── External content ──

  it("calls setValue when external content genuinely differs", async () => {
    const onContentChange = vi.fn();

    const { rerender } = render(
      <VditorFileEditor
        path="/test.md"
        content={ORIGINAL}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    // Emit an edit so lastEmittedRef differs from the initial mount content
    mockGetValue.mockReturnValue(ORIGINAL_EDITED);
    act(() => {
      onMarkdownChangeFromFactory?.(ORIGINAL_EDITED);
    });

    mockSetValue.mockClear();

    // Rerender with genuinely different external content
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={EXTERNAL}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith(EXTERNAL);
    });
  });

  it("does NOT call setValue when external content exactly matches last emitted", async () => {
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

    // Emit an edit so lastEmittedRef has a known value
    mockGetValue.mockReturnValue(HELLO_WORLD);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_WORLD);
    });

    mockSetValue.mockClear();

    // Rerender with the exact same content that was just emitted
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO_WORLD}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it("does NOT call setValue when external content only differs by trailing newline", async () => {
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

    // Emit an edit so lastEmittedRef has a known value
    mockGetValue.mockReturnValue(HELLO_WORLD);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_WORLD);
    });

    mockSetValue.mockClear();

    // Rerender with same content but trailing newline
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO_WORLD_TRAILING}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    expect(mockSetValue).not.toHaveBeenCalled();
  });

  // ── isDeleted ──

  it("suppresses change emissions when isDeleted becomes true", async () => {
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

    // Toggle isDeleted
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={true}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(mockSetReadOnly).toHaveBeenCalled();
    });

    // Edits should be suppressed
    act(() => {
      onMarkdownChangeFromFactory?.(SHOULD_NOT_FIRE);
    });

    expect(onContentChange).not.toHaveBeenCalled();
  });

  it("sets editor to editable when isDeleted toggles back to false", async () => {
    const onContentChange = vi.fn();

    // Start with isDeleted=false so the handle is wired before we toggle
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

    // Toggle to deleted
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={true}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(mockSetReadOnly).toHaveBeenCalled();
    });
    mockSetReadOnly.mockClear();

    // Toggle back to not deleted
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
      expect(mockSetReadOnly).toHaveBeenCalled();
    });
  });

  // ── focusRequestKey ──

  it("calls handle.focus() when focusRequestKey changes", async () => {
    const onContentChange = vi.fn();

    const { rerender } = render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
        focusRequestKey={0}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    mockFocus.mockClear();

    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
        focusRequestKey={1}
      />,
    );

    // Wait for requestAnimationFrame
    await waitFor(() => {
      expect(mockFocus).toHaveBeenCalled();
    });
  });

  it("does NOT call focus when focusRequestKey is 0 (initial value)", async () => {
    const onContentChange = vi.fn();

    render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
        focusRequestKey={0}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    expect(mockFocus).not.toHaveBeenCalled();
  });
});
