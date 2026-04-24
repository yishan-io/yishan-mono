import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readExternalClipboardSourcePathsFromSystem } from "./externalClipboardPipeline";

const mocks = vi.hoisted(() => ({
  runCommandForStdout: vi.fn(),
  clipboardAvailableFormats: vi.fn(),
  clipboardReadText: vi.fn(),
}));

vi.mock("./process", () => ({
  runCommandForStdout: mocks.runCommandForStdout,
}));

vi.mock("electron", () => ({
  clipboard: {
    availableFormats: mocks.clipboardAvailableFormats,
    readText: mocks.clipboardReadText,
  },
}));

describe("readExternalClipboardSourcePathsFromSystem", () => {
  const originalPlatform = process.platform;

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: platform,
    });
  };

  beforeEach(() => {
    mocks.runCommandForStdout.mockReset();
    mocks.clipboardAvailableFormats.mockReset();
    mocks.clipboardReadText.mockReset();

    mocks.clipboardAvailableFormats.mockReturnValue([]);
    mocks.clipboardReadText.mockReturnValue("");
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it("returns success when Electron clipboard text contains one absolute path", async () => {
    setPlatform("darwin");
    mocks.clipboardAvailableFormats.mockReturnValue(["public.utf8-plain-text"]);
    mocks.clipboardReadText.mockReturnValue("/Users/test/Desktop/a.md");

    const result = await readExternalClipboardSourcePathsFromSystem();

    expect(result).toEqual({
      kind: "success",
      sourcePaths: ["/Users/test/Desktop/a.md"],
      clipboardFormats: ["public.utf8-plain-text"],
      strategy: "electron-clipboard-readText",
    });
    expect(mocks.runCommandForStdout).not.toHaveBeenCalled();
  });

  it("preserves macOS fallback extraction through osascript aliases", async () => {
    setPlatform("darwin");
    mocks.clipboardAvailableFormats.mockReturnValue(["public.file-url"]);
    mocks.clipboardReadText.mockReturnValue("");
    mocks.runCommandForStdout.mockResolvedValue("/Users/test/Desktop/from-alias.txt\n");

    const result = await readExternalClipboardSourcePathsFromSystem();

    expect(result).toEqual({
      kind: "success",
      sourcePaths: ["/Users/test/Desktop/from-alias.txt"],
      clipboardFormats: ["public.file-url"],
      strategy: "darwin-aliases",
    });
    expect(mocks.runCommandForStdout).toHaveBeenCalledTimes(1);
  });

  it("preserves Windows fallback extraction through FileDropList", async () => {
    setPlatform("win32");
    mocks.clipboardAvailableFormats.mockReturnValue(["FileNameW"]);
    mocks.clipboardReadText.mockReturnValue("");
    mocks.runCommandForStdout.mockResolvedValue("C:\\Users\\test\\Desktop\\from-windows.txt\n");

    const result = await readExternalClipboardSourcePathsFromSystem();

    expect(result).toEqual({
      kind: "success",
      sourcePaths: ["C:\\Users\\test\\Desktop\\from-windows.txt"],
      clipboardFormats: ["FileNameW"],
      strategy: "win32-file-drop-list",
    });
  });

  it("returns permission-denied when all darwin extraction attempts are denied", async () => {
    setPlatform("darwin");
    mocks.clipboardAvailableFormats.mockReturnValue(["public.file-url"]);
    mocks.clipboardReadText.mockImplementation(() => {
      throw new Error("Not allowed to read clipboard");
    });
    mocks.runCommandForStdout.mockRejectedValue(new Error("Operation not permitted"));

    const result = await readExternalClipboardSourcePathsFromSystem();

    expect(result).toMatchObject({
      kind: "permission-denied",
      sourcePaths: [],
      clipboardFormats: ["public.file-url"],
    });
  });

  it("returns unsupported on non-darwin and non-win32 platforms", async () => {
    setPlatform("linux");
    mocks.clipboardAvailableFormats.mockReturnValue(["text/plain"]);
    mocks.clipboardReadText.mockReturnValue("not-a-path");

    const result = await readExternalClipboardSourcePathsFromSystem();

    expect(result).toEqual({
      kind: "unsupported",
      sourcePaths: [],
      clipboardFormats: ["text/plain"],
      strategy: "platform-gate",
      message: "Native external clipboard extraction is not supported on linux.",
    });
  });
});
