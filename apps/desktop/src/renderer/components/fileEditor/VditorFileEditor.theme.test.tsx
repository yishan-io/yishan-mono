/**
 * @vitest-environment jsdom
 *
 * Theme-related tests for VditorFileEditor.
 * Split from the main test file to keep both under the 500-line limit.
 */

import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { displaySettingsStore } from "../../features/settings/state/displaySettingsStore";
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

vi.mock("./mermaidZoomButton", () => ({
  attachMermaidZoomButtons: vi.fn(() => () => undefined),
  rethemeMermaidDiagrams: vi.fn(() => Promise.resolve()),
}));

import { rethemeMermaidDiagrams } from "./mermaidZoomButton";

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
    // Reset markdown settings to their defaults so tests are isolated.
    displaySettingsStore.setState({
      markdownThemePreference: "inherit",
      markdownPreviewFontSize: "medium",
    });
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
      expect(mockSetTheme).toHaveBeenCalledWith("dark", undefined, "github-dark");
    });
    await waitFor(() => {
      expect(rethemeMermaidDiagrams).toHaveBeenCalled();
    });

    mockSetTheme.mockClear();
    vi.mocked(rethemeMermaidDiagrams).mockClear();

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
      expect(mockSetTheme).toHaveBeenCalledWith("classic", undefined, "github");
    });
    await waitFor(() => {
      expect(rethemeMermaidDiagrams).toHaveBeenCalled();
    });
  });

  it("does not re-render mermaid on the initial mount", async () => {
    render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={false} onContentChange={vi.fn()} />,
    );

    await waitFor(() => {
      expect(onMarkdownChangeFromFactory).not.toBeNull();
    });

    expect(rethemeMermaidDiagrams).not.toHaveBeenCalled();
  });

  // ── Markdown theme override (settings view) ──

  it("forces dark when the markdown theme override is dark even if the app is light", async () => {
    act(() => {
      displaySettingsStore.getState().setMarkdownThemePreference("dark");
    });

    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={false} onContentChange={vi.fn()} />,
    );

    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.getAttribute("data-theme")).toBe("dark");
    expect(capturedCreationOptions?.isDark).toBe(true);

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith("dark", undefined, "github-dark");
    });
  });

  it("forces light when the markdown theme override is light even if the app is dark", async () => {
    act(() => {
      displaySettingsStore.getState().setMarkdownThemePreference("light");
    });

    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={true} onContentChange={vi.fn()} />,
    );

    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.getAttribute("data-theme")).toBe("light");
    expect(capturedCreationOptions?.isDark).toBe(false);

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith("classic", undefined, "github");
    });
  });

  it("follows the app theme when the override is inherit", async () => {
    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={true} onContentChange={vi.fn()} />,
    );

    expect((container.firstChild as HTMLElement).getAttribute("data-theme")).toBe("dark");
  });

  // ── Markdown preview font size (settings view) ──

  it("exposes the markdown preview font size setting as data-font-size", () => {
    act(() => {
      displaySettingsStore.getState().setMarkdownPreviewFontSize("large");
    });

    const { container } = render(
      <VditorFileEditor path="/test.md" content={HELLO} isDeleted={false} isDark={false} onContentChange={vi.fn()} />,
    );

    expect((container.firstChild as HTMLElement).getAttribute("data-font-size")).toBe("large");
  });
});
