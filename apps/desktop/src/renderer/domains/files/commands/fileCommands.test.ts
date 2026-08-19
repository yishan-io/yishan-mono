// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFile,
  createFolder,
  deleteEntry,
  listDetectedExternalAppIds,
  listFiles,
  listFilesBatch,
  openEntryInExternalApp,
  readExternalClipboardSourcePaths,
  readFile,
  renameEntry,
  resolveChatFilePath,
  writeFile,
} from "./fileCommands";

const mocks = vi.hoisted(() => ({
  createFile: vi.fn(),
  createFolder: vi.fn(),
  deleteEntry: vi.fn(),
  listDetectedExternalAppIds: vi.fn(),
  listFiles: vi.fn(),
  listFilesBatch: vi.fn(),
  openEntryInExternalApp: vi.fn(),
  readExternalClipboardSourcePaths: vi.fn(),
  readFile: vi.fn(),
  renameEntry: vi.fn(),
  searchFiles: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../../../domains/files/daemon/daemonFileClient", () => ({
  getFileRpc: () =>
    Promise.resolve({
      createFile: mocks.createFile,
      createFolder: mocks.createFolder,
      deleteEntry: mocks.deleteEntry,
      listFiles: mocks.listFiles,
      listFilesBatch: mocks.listFilesBatch,
      readFile: mocks.readFile,
      renameEntry: mocks.renameEntry,
      searchFiles: mocks.searchFiles,
      writeFile: mocks.writeFile,
    }),
}));

vi.mock("@renderer/platform/hostBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/platform/hostBridge")>();
  return {
    ...actual,
    getDesktopHostBridge: vi.fn(() => ({
      openEntryInExternalApp: mocks.openEntryInExternalApp,
      listDetectedExternalAppIds: mocks.listDetectedExternalAppIds,
      readExternalClipboardSourcePaths: mocks.readExternalClipboardSourcePaths,
    })),
  };
});

describe("fileCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards file command requests to file service", async () => {
    await listFiles({ workspaceId: "workspace-1", relativePath: "src", recursive: false });
    await listFilesBatch({
      workspaceId: "workspace-1",
      requests: [{ relativePath: "src", recursive: false }],
    });
    await readFile({ workspaceId: "workspace-1", relativePath: "a.ts" });
    await writeFile({ workspaceId: "workspace-1", relativePath: "a.ts", content: "x" });
    await createFile({ workspaceId: "workspace-1", relativePath: "b.ts", content: "y" });
    await createFolder({ workspaceId: "workspace-1", relativePath: "src" });
    await renameEntry({ workspaceId: "workspace-1", fromRelativePath: "a.ts", toRelativePath: "c.ts" });
    await deleteEntry({ workspaceId: "workspace-1", relativePath: "c.ts" });
    await openEntryInExternalApp({
      workspaceWorktreePath: "/tmp/repo",
      appId: "system-file-manager",
      relativePath: "src",
    });
    await openEntryInExternalApp({ workspaceWorktreePath: "/tmp/repo", appId: "cursor" });
    await listDetectedExternalAppIds();
    await readExternalClipboardSourcePaths();

    expect(mocks.listFiles).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "src",
      recursive: false,
    });
    expect(mocks.listFilesBatch).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      requests: [{ relativePath: "src", recursive: false }],
    });
    expect(mocks.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "a.ts" });
    expect(mocks.writeFile).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "a.ts",
      content: "x",
    });
    expect(mocks.writeFile).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "b.ts",
      content: "y",
    });
    expect(mocks.createFolder).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src" });
    expect(mocks.renameEntry).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      fromRelativePath: "a.ts",
      toRelativePath: "c.ts",
    });
    expect(mocks.deleteEntry).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "c.ts" });
    expect(mocks.openEntryInExternalApp).toHaveBeenNthCalledWith(1, {
      workspaceWorktreePath: "/tmp/repo",
      appId: "system-file-manager",
      relativePath: "src",
    });
    expect(mocks.openEntryInExternalApp).toHaveBeenNthCalledWith(2, {
      workspaceWorktreePath: "/tmp/repo",
      appId: "cursor",
    });
    expect(mocks.listDetectedExternalAppIds).toHaveBeenCalledTimes(1);
    expect(mocks.readExternalClipboardSourcePaths).toHaveBeenCalledTimes(1);
  });

  it("resolveChatFilePath returns the exact file when it exists", async () => {
    mocks.readFile.mockResolvedValueOnce({ content: "real content" });

    const result = await resolveChatFilePath({ workspaceId: "workspace-1", relativePath: "src/a.ts" });

    expect(result).toEqual({ status: "found", path: "src/a.ts", content: "real content" });
    expect(mocks.searchFiles).not.toHaveBeenCalled();
  });

  it("resolveChatFilePath finds a unique suffix match when the referenced path does not exist", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("no such file"));
    mocks.searchFiles.mockResolvedValueOnce([
      { path: "src/db/index.ts", score: 1, highlightedPathIndexes: [] },
      { path: "src/other/index.ts", score: 2, highlightedPathIndexes: [] },
    ]);
    mocks.readFile.mockResolvedValueOnce({ content: "db content" });

    const result = await resolveChatFilePath({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(mocks.searchFiles).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      query: "db/index.ts",
      includeDirectories: false,
    });
    expect(result).toEqual({ status: "found", path: "src/db/index.ts", content: "db content" });
  });

  it("resolveChatFilePath reports not-found for ambiguous matches", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("no such file"));
    mocks.searchFiles.mockResolvedValueOnce([
      { path: "src/db/index.ts", score: 1, highlightedPathIndexes: [] },
      { path: "lib/db/index.ts", score: 2, highlightedPathIndexes: [] },
    ]);

    const result = await resolveChatFilePath({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(result).toEqual({ status: "not-found" });
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });

  it("resolveChatFilePath reports unavailable on non-not-found read failures without searching", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("connection closed"));

    const result = await resolveChatFilePath({ workspaceId: "workspace-1", relativePath: "src/a.ts" });

    expect(result).toEqual({ status: "unavailable" });
    expect(mocks.searchFiles).not.toHaveBeenCalled();
  });

  it("resolveChatFilePath reports unavailable when the search fails", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("no such file"));
    mocks.searchFiles.mockRejectedValueOnce(new Error("connection closed"));

    const result = await resolveChatFilePath({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(result).toEqual({ status: "unavailable" });
  });

  it("resolveChatFilePath reports unavailable when verifying the candidate fails", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("no such file"));
    mocks.searchFiles.mockResolvedValueOnce([{ path: "src/db/index.ts", score: 1, highlightedPathIndexes: [] }]);
    mocks.readFile.mockRejectedValueOnce(new Error("connection closed"));

    const result = await resolveChatFilePath({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(result).toEqual({ status: "unavailable" });
  });
});
