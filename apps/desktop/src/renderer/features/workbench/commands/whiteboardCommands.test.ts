import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  createFile: vi.fn(),
  openTab: vi.fn(),
}));

vi.mock("../../../features/files/commands/fileCommands", () => ({
  listFiles: mocks.listFiles,
  createFile: mocks.createFile,
}));

vi.mock("./tabCommands", () => ({
  openTab: mocks.openTab,
}));

import { createNewWhiteboard, resolveNextWhiteboardPath } from "./whiteboardCommands";

describe("resolveNextWhiteboardPath", () => {
  it("returns whiteboard.excalidraw when nothing collides", () => {
    expect(resolveNextWhiteboardPath([])).toBe("whiteboard.excalidraw");
  });

  it("bumps to whiteboard-2.excalidraw when the base name is taken", () => {
    expect(resolveNextWhiteboardPath(["whiteboard.excalidraw"])).toBe("whiteboard-2.excalidraw");
  });

  it("skips taken numbered names and returns the lowest free one", () => {
    expect(
      resolveNextWhiteboardPath(["whiteboard.excalidraw", "whiteboard-2.excalidraw", "whiteboard-4.excalidraw"]),
    ).toBe("whiteboard-3.excalidraw");
  });

  it("ignores unrelated files", () => {
    expect(resolveNextWhiteboardPath(["readme.md", "src/main.ts", "whiteboard.txt"])).toBe("whiteboard.excalidraw");
  });
});

describe("createNewWhiteboard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a deduped whiteboard file and opens it as a file tab", async () => {
    mocks.listFiles.mockResolvedValueOnce({
      files: [{ path: "whiteboard.excalidraw" }, { path: "readme.md" }],
    });
    mocks.createFile.mockResolvedValueOnce(undefined);

    const createdPath = await createNewWhiteboard("workspace-1");

    expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "", recursive: false });
    expect(mocks.createFile).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "whiteboard-2.excalidraw",
      content: expect.stringContaining('"type":"excalidraw"'),
    });
    expect(mocks.openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "file",
      path: "whiteboard-2.excalidraw",
      content: expect.stringContaining('"type":"excalidraw"'),
    });
    expect(createdPath).toBe("whiteboard-2.excalidraw");
  });

  it("uses whiteboard.excalidraw when the name is free", async () => {
    mocks.listFiles.mockResolvedValueOnce({ files: [{ path: "readme.md" }] });

    await createNewWhiteboard("workspace-1");

    expect(mocks.createFile).toHaveBeenCalledWith(expect.objectContaining({ relativePath: "whiteboard.excalidraw" }));
    expect(mocks.openTab).toHaveBeenCalledWith(expect.objectContaining({ path: "whiteboard.excalidraw" }));
  });

  it("returns null and opens nothing when listing fails", async () => {
    mocks.listFiles.mockRejectedValueOnce(new Error("daemon offline"));

    const createdPath = await createNewWhiteboard("workspace-1");

    expect(createdPath).toBeNull();
    expect(mocks.createFile).not.toHaveBeenCalled();
    expect(mocks.openTab).not.toHaveBeenCalled();
  });
});
