/**
 * @vitest-environment jsdom
 *
 * Tests for the imperative Vditor editor factory (vditorEditor.ts).
 * Uses a mocked Vditor class to verify constructor options, handle
 * delegation, and guard behaviour without needing a real lute instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks (vi.mock is hoisted — use vi.hoisted for captured state)
// ---------------------------------------------------------------------------

const {
  mockDisabled,
  mockEnable,
  mockDestroy,
  mockFocus,
  mockGetValue,
  mockSetValue,
  capturedConstructorOptions,
  capturedAfterCallback,
  capturedInputCallback,
  mockVditorInstance,
  shouldThrow,
} = vi.hoisted(() => {
  const mockDisabled = vi.fn();
  const mockEnable = vi.fn();
  const mockDestroy = vi.fn();
  const mockFocus = vi.fn();
  const mockGetValue = vi.fn().mockReturnValue("# mock value");
  const mockSetValue = vi.fn();

  const capturedConstructorOptions: { current: Record<string, unknown> | null } = {
    current: null,
  };
  const capturedAfterCallback: { current: (() => void) | null } = { current: null };
  const capturedInputCallback: { current: ((value: string) => void) | null } = {
    current: null,
  };

  const mockVditorInstance = {
    getValue: mockGetValue,
    setValue: mockSetValue,
    disabled: mockDisabled,
    enable: mockEnable,
    destroy: mockDestroy,
    focus: mockFocus,
  };

  const shouldThrow: { current: boolean } = { current: false };

  return {
    mockDisabled,
    mockEnable,
    mockDestroy,
    mockFocus,
    mockGetValue,
    mockSetValue,
    capturedConstructorOptions,
    capturedAfterCallback,
    capturedInputCallback,
    mockVditorInstance,
    shouldThrow,
  };
});

// Must use a function (not arrow) so `new` works in the factory
function MockVditorConstructor(
  this: Record<string, unknown>,
  _id: string | HTMLElement,
  options: Record<string, unknown>,
) {
  if (shouldThrow.current) {
    throw new Error("Cannot find element");
  }
  capturedConstructorOptions.current = options;
  capturedAfterCallback.current = options.after as (() => void) | null;
  capturedInputCallback.current = options.input as ((value: string) => void) | null;
  return Object.assign(this, mockVditorInstance);
}

vi.mock("vditor", () => ({
  default: MockVditorConstructor,
}));

vi.mock("vditor/dist/js/lute/lute.min.js?url", () => ({
  default: "/mocked/lute.min.js",
}));

// ---------------------------------------------------------------------------
// SUT — imported AFTER mocks
// ---------------------------------------------------------------------------

import { createVditorEditor, resolveVditorLang } from "./vditorEditor";
import type { VditorEditorOptions } from "./vditorEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRoot(): HTMLElement {
  const el = document.createElement("div");
  el.className = "vditor-app-editor";
  return el;
}

/** Creates the editor handle by constructing and firing after(). */
async function createEditor(root: HTMLElement, options: VditorEditorOptions) {
  const handlePromise = createVditorEditor(root, options);

  // after() should have been captured; call it to resolve the promise
  if (capturedAfterCallback.current) {
    capturedAfterCallback.current();
  }

  return handlePromise;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createVditorEditor factory", () => {
  let root: HTMLElement;
  let onMarkdownChange: (markdown: string) => void;

  beforeEach(() => {
    root = createRoot();
    onMarkdownChange = vi.fn();
    capturedConstructorOptions.current = null;
    capturedAfterCallback.current = null;
    capturedInputCallback.current = null;
    shouldThrow.current = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // ---- Constructor options ----------------------------------------------

  it("passes mode 'ir' to the Vditor constructor", async () => {
    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    expect(capturedConstructorOptions.current?.mode).toBe("ir");
  });

  it("passes cache { enable: false } to disable localStorage caching", async () => {
    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    expect(capturedConstructorOptions.current?.cache).toEqual({ enable: false });
  });

  it("configures the formatting toolbar with curated items", async () => {
    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    const toolbar = capturedConstructorOptions.current?.toolbar as Array<string> | undefined;
    expect(toolbar).toContain("undo");
    expect(toolbar).toContain("bold");
    expect(toolbar).toContain("headings");
    expect(toolbar).toContain("table");
  });

  it("passes _lutePath as the mocked lute URL", async () => {
    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    expect(capturedConstructorOptions.current?._lutePath).toBe("/mocked/lute.min.js");
  });

  it("uses theme 'classic' when isDark is false", async () => {
    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    expect(capturedConstructorOptions.current?.theme).toBe("classic");
    // Light mode uses the light syntax-highlight palette (github).
    expect(capturedConstructorOptions.current?.preview).toMatchObject({ hljs: { style: "github" } });
  });

  it("uses theme 'dark' when isDark is true", async () => {
    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: true,
      onMarkdownChange,
    });

    expect(capturedConstructorOptions.current?.theme).toBe("dark");
    // Dark mode swaps the syntax-highlight palette so tokens stay readable
    // on the dark code surface (github tokens would be too dark).
    expect(capturedConstructorOptions.current?.preview).toMatchObject({ hljs: { style: "github-dark" } });
  });

  it("passes defaultValue as the initial value", async () => {
    await createEditor(root, {
      defaultValue: "# Initial content",
      isDark: false,
      onMarkdownChange,
    });

    expect(capturedConstructorOptions.current?.value).toBe("# Initial content");
  });

  // ---- after() resolves the handle --------------------------------------

  it("resolves the handle after lute is ready (after() callback)", async () => {
    const promise = createVditorEditor(root, {
      defaultValue: "# Test",
      isDark: false,
      onMarkdownChange,
    });

    // Promise should not resolve until after() is called
    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });

    // Flush microtask queue
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Now trigger after()
    capturedAfterCallback.current?.();
    const handle = await promise;
    expect(handle).toBeDefined();
    expect(handle.vditor).toEqual(mockVditorInstance);
  });

  // ---- input callback wiring --------------------------------------------

  it("forwards input callback to onMarkdownChange", async () => {
    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    expect(capturedInputCallback.current).toBeDefined();
    capturedInputCallback.current?.("# Updated content");
    expect(onMarkdownChange).toHaveBeenCalledWith("# Updated content");
  });

  // ---- Handle method delegation -----------------------------------------

  it("getValue() delegates to vditor.getValue()", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    mockGetValue.mockReturnValue("# current");
    expect(handle.getValue()).toBe("# current");
    expect(mockGetValue).toHaveBeenCalled();
  });

  it("setValue(md) delegates to vditor.setValue(md, false)", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    handle.setValue("# new content");
    expect(mockSetValue).toHaveBeenCalledWith("# new content", false);
  });

  it("flush() returns getValue() result", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    mockGetValue.mockReturnValue("# flushed");
    expect(handle.flush()).toBe("# flushed");
    expect(mockGetValue).toHaveBeenCalled();
  });

  it("destroy() delegates to vditor.destroy()", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    handle.destroy();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it("focus() delegates to vditor.focus()", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    handle.focus();
    expect(mockFocus).toHaveBeenCalled();
  });

  // ---- setReadOnly guard behaviour -------------------------------------

  it("setReadOnly(true) calls disabled()", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    handle.setReadOnly(true);
    expect(mockDisabled).toHaveBeenCalledOnce();
  });

  it("setReadOnly(true) called again is idempotent (no re-call)", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    handle.setReadOnly(true);
    handle.setReadOnly(true);
    handle.setReadOnly(true);
    expect(mockDisabled).toHaveBeenCalledOnce();
  });

  it("setReadOnly(false) calls enable() after exiting readOnly mode", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    // Must enter readOnly mode first for enable() to be called
    handle.setReadOnly(true);
    vi.clearAllMocks();
    handle.setReadOnly(false);
    expect(mockEnable).toHaveBeenCalledOnce();
  });

  it("setReadOnly(false) called again is idempotent after exiting readOnly mode", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    handle.setReadOnly(true);
    vi.clearAllMocks();
    handle.setReadOnly(false);
    handle.setReadOnly(false);
    expect(mockEnable).toHaveBeenCalledOnce();
  });

  it("setReadOnly toggle: false→true→false→true changes state correctly", async () => {
    const handle = await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    // Start: not readonly
    handle.setReadOnly(true);
    expect(mockDisabled).toHaveBeenCalledOnce();

    handle.setReadOnly(false);
    expect(mockEnable).toHaveBeenCalledOnce();

    handle.setReadOnly(true);
    expect(mockDisabled).toHaveBeenCalledTimes(2);

    handle.setReadOnly(false);
    expect(mockEnable).toHaveBeenCalledTimes(2);
  });

  // ---- Error during construction ----------------------------------------

  it("rejects if Vditor constructor throws synchronously", async () => {
    shouldThrow.current = true;

    const promise = createVditorEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });

    await expect(promise).rejects.toThrow("Cannot find element");
  });

  it("passes lang to the constructor (defaults to en_US)", async () => {
    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      onMarkdownChange,
    });
    expect(capturedConstructorOptions.current?.lang).toBe("en_US");

    await createEditor(root, {
      defaultValue: "# Hello",
      isDark: false,
      lang: "zh_CN",
      onMarkdownChange,
    });
    expect(capturedConstructorOptions.current?.lang).toBe("zh_CN");
  });
});

describe("resolveVditorLang", () => {
  it("maps supported app languages to Vditor i18n codes", () => {
    expect(resolveVditorLang("en")).toBe("en_US");
    expect(resolveVditorLang("en-US")).toBe("en_US");
    expect(resolveVditorLang("zh")).toBe("zh_CN");
    expect(resolveVditorLang("zh-CN")).toBe("zh_CN");
    expect(resolveVditorLang("de")).toBe("de_DE");
    expect(resolveVditorLang("ja")).toBe("ja_JP");
  });

  it("falls back to en_US for undefined or unsupported languages", () => {
    expect(resolveVditorLang(undefined)).toBe("en_US");
    expect(resolveVditorLang("fr")).toBe("fr_FR");
    expect(resolveVditorLang("xx")).toBe("en_US");
  });
});
