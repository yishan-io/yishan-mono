/**
 * @vitest-environment jsdom
 *
 * Lifecycle and regression tests for VditorFileEditor.
 * Split from the main test file to keep both under the 500-line limit.
 */
import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VditorFileEditor } from "./VditorFileEditor";
// Mock handle (duplicated from main test file — test-specific state)
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

// Shared controls for tests that need to delay handle resolution.

let delayHandleCreation = false;
let handleResolver: ((h: ReturnType<typeof createFakeHandle>) => void) | null = null;

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

      if (delayHandleCreation) {
        return new Promise<ReturnType<typeof createFakeHandle>>((resolve) => {
          handleResolver = resolve;
        });
      }

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
const HELLO_TRAILING = "# Hello\n";

// Lifecycle & regression tests

describe("VditorFileEditor lifecycle", () => {
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

  // ── F1 regression: revert-to-initial ──

  it("forwards revert-to-initial content changes after the first emission", async () => {
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

    // First, emit a genuinely different edit (consumes hasEmittedRef guard)
    mockGetValue.mockReturnValue(HELLO_WORLD);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_WORLD);
    });
    expect(onContentChange).toHaveBeenCalledWith(HELLO_WORLD);
    onContentChange.mockClear();

    // Revert to exact original content — must fire because hasEmittedRef
    // is already consumed and the stale-emission guard passes.
    mockGetValue.mockReturnValue(HELLO);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO);
    });

    expect(onContentChange).toHaveBeenCalledWith(HELLO);
  });

  // ── F2: mount-with-isDeleted=true ──

  it("applies readOnly via setReadOnly when mounted with isDeleted=true", async () => {
    render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={true} isDark={false} onContentChange={vi.fn()} />,
    );

    await waitFor(() => {
      // The onHandleReady path should have called setReadOnly
      expect(mockSetReadOnly).toHaveBeenCalled();
    });
  });

  // ── F4: stale-emission guard ──

  it("suppresses stale listener emissions when getValue does not match", async () => {
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

    // First emission: getValue matches → should forward
    mockGetValue.mockReturnValue(HELLO_WORLD);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_WORLD);
    });
    expect(onContentChange).toHaveBeenCalledWith(HELLO_WORLD);
    onContentChange.mockClear();

    // Now suppress: listener fires with stale markdown that doesn't match getValue
    mockGetValue.mockReturnValue("current content");
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_TRAILING);
    });

    expect(onContentChange).not.toHaveBeenCalled();
  });

  // ── destroy on unmount ──

  it("calls handle.destroy() on unmount", async () => {
    const { unmount } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={false} onContentChange={vi.fn()} />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    unmount();

    await waitFor(() => {
      expect(mockDestroyImpl).toHaveBeenCalled();
    });
  });

  // ── StrictMode double-mount ──

  it("handles StrictMode double-mount by destroying pending handle on unmount", async () => {
    delayHandleCreation = true;

    const { unmount } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={false} onContentChange={vi.fn()} />,
    );

    await waitFor(() => {
      expect(capturedCreationOptions).not.toBeNull();
    });

    // Unmount while the handle is still pending
    unmount();

    // Now resolve — the pending-destroy path in cleanup should call destroy()
    const handle = createFakeHandle();
    handleResolver?.(handle);

    await waitFor(() => {
      expect(handle.destroy).toHaveBeenCalled();
    });
  });

  // ── Pending-focus retry (F2: handle-ready path) ──

  it("retries focus when handle is not ready at focusRequestKey change", async () => {
    delayHandleCreation = true;

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
      expect(handleResolver).not.toBeNull();
    });

    // Request focus before handle is ready
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

    // Focus should not have been called yet (handle not ready)
    expect(mockFocus).not.toHaveBeenCalled();

    // Resolve the handle — should retry focus in onHandleReady
    const handle = createFakeHandle();
    handleResolver?.(handle);

    await waitFor(() => {
      expect(mockFocus).toHaveBeenCalled();
    });
  });

  // ── external content apply while deleted (suppressed) ──

  it("suppresses external content apply when isDeleted is true", async () => {
    const onContentChange = vi.fn();

    const { rerender } = render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={true}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    mockSetValue.mockClear();

    // External content arrives while isDeleted=true
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO_WORLD}
        isDeleted={true}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    // setValue should NOT be called while deleted
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  // ── flushNow via imperative handle ──

  it("exposes flushNow that returns current content via handle.getValue()", async () => {
    const onContentChange = vi.fn();
    const ref = { current: null as { flushNow: () => string } | null };

    render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
        ref={ref}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    mockGetValue.mockReturnValue("flushed content");

    const result = ref.current?.flushNow();
    expect(result).toBe("flushed content");
  });

  it("flushNow emits onContentChange when flushed content differs from last emitted", async () => {
    const onContentChange = vi.fn();
    const ref = { current: null as { flushNow: () => string } | null };

    render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
        ref={ref}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    // Emit an edit to set lastEmittedRef
    mockGetValue.mockReturnValue(HELLO_WORLD);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_WORLD);
    });
    onContentChange.mockClear();

    // flushNow with new content that differs from lastEmittedRef
    mockGetValue.mockReturnValue("newer flushed content");
    ref.current?.flushNow();
    expect(onContentChange).toHaveBeenCalledWith("newer flushed content");
  });

  // ── EOL preservation: CRLF files keep CRLF on emission ──

  it("converts LF emissions back to CRLF for CRLF files", async () => {
    const onContentChange = vi.fn();
    const CRLF_CONTENT = "# Hello\r\n\r\nWorld";
    const LF_EMISSION = "# Hello\n\nWorld\n\nMore";
    const CRLF_EXPECTED = "# Hello\r\n\r\nWorld\r\n\r\nMore";

    render(
      <VditorFileEditor
        path="/test.md"
        content={CRLF_CONTENT}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    // Vditor emits LF-normalized markdown; the wrapper must convert to CRLF
    mockGetValue.mockReturnValue(LF_EMISSION);
    act(() => {
      onMarkdownChangeFromFactory?.(LF_EMISSION);
    });
    expect(onContentChange).toHaveBeenCalledWith(CRLF_EXPECTED);
  });

  it("leaves LF emissions unchanged for LF files", async () => {
    const onContentChange = vi.fn();
    const LF_EMISSION = "# Hello\n\nWorld\n\nMore";

    render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO_WORLD}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    mockGetValue.mockReturnValue(LF_EMISSION);
    act(() => {
      onMarkdownChangeFromFactory?.(LF_EMISSION);
    });
    expect(onContentChange).toHaveBeenCalledWith(LF_EMISSION);
  });

  // ── Pending external content reconcile on handle-ready (Fix 4 regression) ──

  it("does not suppress first emission matching new content applied on handle-ready", async () => {
    delayHandleCreation = true;
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
      expect(capturedCreationOptions).not.toBeNull();
    });

    // Content changes while create is still pending (handle not ready yet)
    rerender(
      <VditorFileEditor
        path="/test.md"
        content={HELLO_WORLD}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
      />,
    );

    // Resolve the handle — onHandleReady should apply the new content
    // and reconcile initialContentNormalizedRef to HELLO_WORLD
    const handle = createFakeHandle();
    handleResolver?.(handle);

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith(HELLO_WORLD);
    });

    // First emission matching the NEW content should be suppressed (F1 gate uses reconciled baseline)
    mockGetValue.mockReturnValue(HELLO_WORLD);
    act(() => {
      onMarkdownChangeFromFactory?.(HELLO_WORLD);
    });
    expect(onContentChange).not.toHaveBeenCalled();
  });

  // ── flushNow with null handle ──

  it("flushNow returns content prop when handle is null (not yet created)", () => {
    delayHandleCreation = true;
    const onContentChange = vi.fn();
    const ref = { current: null as { flushNow: () => string } | null };

    render(
      <VditorFileEditor
        path="/test.md"
        content={HELLO}
        isDeleted={false}
        isDark={false}
        onContentChange={onContentChange}
        ref={ref}
      />,
    );

    // flushNow before handle is ready should return the content prop
    const result = ref.current?.flushNow();
    expect(result).toBe(HELLO);
    expect(onContentChange).not.toHaveBeenCalled();
  });
});
