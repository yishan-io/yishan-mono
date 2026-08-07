/**
 * @vitest-environment jsdom
 *
 * Shared-editor-instance tests for VditorFileEditor.
 * Split from the lifecycle test file to keep both under the 500-line limit.
 */

import { fireEvent, render, waitFor } from "@testing-library/react";
import { StrictMode, act } from "react";
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

// ---------------------------------------------------------------------------
// Shared controls for tests that need to delay handle resolution.
// ---------------------------------------------------------------------------

let delayHandleCreation = false;
let handleResolver: ((h: ReturnType<typeof createFakeHandle>) => void) | null = null;

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

      if (delayHandleCreation) {
        return new Promise<ReturnType<typeof createFakeHandle>>((resolve) => {
          handleResolver = resolve;
        });
      }

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
const HELLO_WORLD = "# Hello\n\nWorld";

// ---------------------------------------------------------------------------
// Shared-editor-instance tests
// ---------------------------------------------------------------------------

describe("VditorFileEditor shared editor instance", () => {
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCreationOptions = null;
    onMarkdownChangeFromFactory = null;
    mockGetValue.mockReturnValue("# test");
    delayHandleCreation = false;
    handleResolver = null;
    styleEl = addEditorStyles();
  });

  afterEach(() => {
    delayHandleCreation = false;
    handleResolver = null;
    styleEl.remove();
  });

  // ── StrictMode remount shares one editor per root ──

  it("shares one editor instance per root div across StrictMode double-mount", async () => {
    delayHandleCreation = true;

    const onContentChange = vi.fn();

    render(
      <StrictMode>
        <VditorFileEditor
          path="/test.md"
          content={HELLO}
          isDeleted={false}
          isDark={false}
          onContentChange={onContentChange}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(capturedCreationOptions).not.toBeNull();
    });

    // Verify createVditorEditor was called exactly once despite StrictMode double-mount
    const createEditorModule = await import("./vditorEditor");
    const mockCreate = createEditorModule.createVditorEditor as ReturnType<typeof vi.fn>;
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Resolve the handle — it should survive (not be destroyed by the first mount's cleanup)
    const handle = createFakeHandle();
    mockGetValue.mockReturnValue(HELLO_WORLD);
    handleResolver?.(handle);

    await waitFor(() => {
      expect(handle.destroy).not.toHaveBeenCalled();
    });

    // An emission through the factory's input callback reaches the live mount
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_WORLD);
    });

    expect(onContentChange).toHaveBeenCalledWith(HELLO_WORLD);
  });

  // ── Single-mount unmount after handle ready destroys the editor ──

  it("destroys the editor on unmount after handle is ready", async () => {
    const onContentChange = vi.fn();

    const { unmount } = render(
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

    expect(mockDestroyImpl).not.toHaveBeenCalled();

    unmount();

    await waitFor(() => {
      expect(mockDestroyImpl).toHaveBeenCalled();
    });
  });

  // ── Select-all (Cmd/Ctrl+A) ──

  it("intercepts Cmd+A and selects the whole IR content", () => {
    const onContentChange = vi.fn();

    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={false} onContentChange={onContentChange} />,
    );

    const rootDiv = container.firstChild as HTMLElement;
    // Simulate the IR DOM Vditor would build inside the root.
    rootDiv.innerHTML = '<div class="vditor-ir"><pre class="vditor-reset">line one\nline two\nline three</pre></div>';
    const pre = rootDiv.querySelector("pre") as HTMLElement;

    // The handler is a window-capture listener; dispatch on the focused pre.
    const canceled = fireEvent.keyDown(pre, { key: "a", metaKey: true, code: "KeyA" });

    expect(canceled).toBe(false); // prevented
    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(false);
    expect(selection?.toString()).toBe("line one\nline two\nline three");
  });

  it("does not intercept non-select-all keys", () => {
    const onContentChange = vi.fn();

    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={false} onContentChange={onContentChange} />,
    );

    const rootDiv = container.firstChild as HTMLElement;
    rootDiv.innerHTML = '<div class="vditor-ir"><pre class="vditor-reset">content</pre></div>';
    const pre = rootDiv.querySelector("pre") as HTMLElement;

    expect(fireEvent.keyDown(pre, { key: "a", code: "KeyA" })).toBe(true); // not prevented

    expect(fireEvent.keyDown(pre, { key: "s", metaKey: true, code: "KeyS" })).toBe(true); // not prevented
  });

  it("does not intercept Cmd+A when the file is deleted (read-only)", () => {
    const onContentChange = vi.fn();

    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={true} isDark={false} onContentChange={onContentChange} />,
    );

    const rootDiv = container.firstChild as HTMLElement;
    rootDiv.innerHTML = '<div class="vditor-ir"><pre class="vditor-reset">content</pre></div>';
    const pre = rootDiv.querySelector("pre") as HTMLElement;

    expect(fireEvent.keyDown(pre, { key: "a", metaKey: true, code: "KeyA" })).toBe(true); // not prevented
  });
});
