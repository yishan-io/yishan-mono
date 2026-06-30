import { describe, expect, it, vi } from "vitest";

import {
  buildTerminalInsertedImagePath,
  buildTerminalUploadAbsolutePath,
  buildTerminalUploadRelativePath,
  escapePathForShell,
} from "./shell-terminal-upload-domain";

describe("shell-terminal-upload-domain", () => {
  it("escapes shell paths with spaces and quotes", () => {
    expect(escapePathForShell("/tmp/image's folder/test image.png")).toBe("'/tmp/image'\\''s folder/test image.png'");
  });

  it("builds a stable workspace absolute upload path", () => {
    expect(buildTerminalUploadAbsolutePath("/tmp/workspace/", ".my-context/uploads/image.png")).toBe(
      "/tmp/workspace/.my-context/uploads/image.png",
    );
  });

  it("builds an ignored workspace-relative upload path with a sanitized file name", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:34:56.000Z"));

    expect(buildTerminalUploadRelativePath("camera roll image!!.jpeg", "image/jpeg")).toBe(
      ".my-context/uploads/1782822896000-camera-roll-image.jpeg",
    );

    vi.useRealTimers();
  });

  it("builds the terminal shell input for one inserted image path", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:34:56.000Z"));

    expect(
      buildTerminalInsertedImagePath({
        fileName: "Team Photo.png",
        mimeType: "image/png",
        workspaceLocalPath: "/Users/test/workspace",
      }),
    ).toEqual({
      absolutePath: "/Users/test/workspace/.my-context/uploads/1782822896000-Team-Photo.png",
      relativePath: ".my-context/uploads/1782822896000-Team-Photo.png",
      shellInput: "/Users/test/workspace/.my-context/uploads/1782822896000-Team-Photo.png ",
    });

    vi.useRealTimers();
  });
});
