/**
 * @vitest-environment jsdom
 */

import { ThemeProvider, createTheme } from "@mui/material/styles";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { type ComponentProps, StrictMode, act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalTaskDescriptionEditor } from "./LocalTaskDescriptionEditor";

const mockSetValue = vi.fn();
const mockDestroy = vi.fn();
const mockSetReadOnly = vi.fn();

function createFakeHandle() {
  return {
    vditor: { setTheme: vi.fn() },
    getValue: vi.fn(),
    setValue: mockSetValue,
    flush: vi.fn(),
    destroy: mockDestroy,
    setReadOnly: mockSetReadOnly,
    focus: vi.fn(),
  };
}

let onMarkdownChange: ((markdown: string) => void) | null = null;
let delayHandleCreation = false;
let handleResolver: ((handle: ReturnType<typeof createFakeHandle>) => void) | null = null;
let creationOptions: {
  defaultValue: string;
  isDark: boolean;
  lang?: string;
  placeholder: string;
  onMarkdownChange: (markdown: string) => void;
} | null = null;

vi.mock("../../../files/features/file-editor/vditor/vditorEditor", () => ({
  resolveVditorLang: vi.fn(() => "en_US"),
  createVditorEditor: vi.fn((root: HTMLElement, options) => {
    creationOptions = options;
    onMarkdownChange = options.onMarkdownChange;
    root.innerHTML = '<div class="vditor-ir"><pre class="vditor-reset" contenteditable="true"></pre></div>';
    if (delayHandleCreation) {
      return new Promise<ReturnType<typeof createFakeHandle>>((resolve) => {
        handleResolver = resolve;
      });
    }
    return Promise.resolve(createFakeHandle());
  }),
}));

function renderEditor(overrides: Partial<ComponentProps<typeof LocalTaskDescriptionEditor>> = {}) {
  return render(
    <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
      <LocalTaskDescriptionEditor
        value="# Initial"
        onChange={vi.fn()}
        disabled={false}
        ariaLabel="Task description"
        placeholder="Describe the task"
        {...overrides}
      />
    </ThemeProvider>,
  );
}

describe("LocalTaskDescriptionEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    creationOptions = null;
    onMarkdownChange = null;
    delayHandleCreation = false;
    handleResolver = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("mounts a named, usable editing surface with the current theme and language", async () => {
    const { container } = renderEditor();
    const root = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(root).minHeight).toBe("280px");
    expect(getComputedStyle(root).overflow).not.toBe("hidden");
    expect(root.getAttribute("role")).toBeNull();

    await waitFor(() => {
      expect(creationOptions).toMatchObject({
        defaultValue: "# Initial",
        isDark: true,
        lang: "en_US",
        placeholder: "Describe the task",
      });
      expect(root.querySelector(".vditor-ir [contenteditable]")?.getAttribute("aria-label")).toBe("Task description");
    });
  });

  it("forwards user Markdown changes", async () => {
    const onChange = vi.fn();
    renderEditor({ onChange });

    await waitFor(() => {
      expect(onMarkdownChange).not.toBeNull();
    });

    act(() => {
      onMarkdownChange?.("# Updated");
    });

    expect(onChange).toHaveBeenCalledWith("# Updated");
  });

  it("does not overwrite a user edit echoed back by the parent", async () => {
    const onChange = vi.fn();
    const { rerender } = renderEditor({ onChange });

    await waitFor(() => {
      expect(onMarkdownChange).not.toBeNull();
    });
    act(() => {
      onMarkdownChange?.("# Updated");
    });

    rerender(
      <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
        <LocalTaskDescriptionEditor
          value="# Updated"
          onChange={onChange}
          disabled={false}
          ariaLabel="Task description"
          placeholder="Describe the task"
        />
      </ThemeProvider>,
    );

    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it("applies an external reset", async () => {
    const { rerender } = renderEditor();

    await waitFor(() => {
      expect(onMarkdownChange).not.toBeNull();
    });
    act(() => {
      onMarkdownChange?.("# Edited");
    });

    rerender(
      <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
        <LocalTaskDescriptionEditor
          value=""
          onChange={vi.fn()}
          disabled={false}
          ariaLabel="Task description"
          placeholder="Describe the task"
        />
      </ThemeProvider>,
    );

    expect(mockSetValue).toHaveBeenCalledWith("");
  });

  it("makes the editor read-only and ignores changes while disabled", async () => {
    const onChange = vi.fn();
    renderEditor({ disabled: true, onChange });

    await waitFor(() => {
      expect(mockSetReadOnly).toHaveBeenCalledWith(true);
    });
    const editingSurface = screen.getByRole("textbox", { name: "Task description" });
    expect(editingSurface.hasAttribute("contenteditable")).toBe(true);
    expect(editingSurface.getAttribute("aria-readonly")).toBe("true");
    expect(editingSurface.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      onMarkdownChange?.("# Ignored");
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shares a delayed editor creation across StrictMode remounts", async () => {
    delayHandleCreation = true;
    const onChange = vi.fn();

    render(
      <StrictMode>
        <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
          <LocalTaskDescriptionEditor
            value="# Initial"
            onChange={onChange}
            disabled={false}
            ariaLabel="Task description"
            placeholder="Describe the task"
          />
        </ThemeProvider>
      </StrictMode>,
    );

    const editorModule = await import("../../../files/features/file-editor/vditor/vditorEditor");
    const mockCreate = editorModule.createVditorEditor as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(handleResolver).not.toBeNull();
    });

    const handle = createFakeHandle();
    act(() => {
      handleResolver?.(handle);
    });

    await waitFor(() => {
      expect(handle.destroy).not.toHaveBeenCalled();
    });

    act(() => {
      onMarkdownChange?.("# Updated");
    });
    expect(onChange).toHaveBeenCalledWith("# Updated");
  });

  it("destroys the editor when unmounted", async () => {
    const { unmount } = renderEditor();

    await waitFor(() => {
      expect(onMarkdownChange).not.toBeNull();
    });
    unmount();

    await waitFor(() => {
      expect(mockDestroy).toHaveBeenCalledOnce();
    });
  });
});
