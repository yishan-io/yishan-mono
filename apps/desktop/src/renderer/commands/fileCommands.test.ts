// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  createFile,
  createFolder,
  deleteEntry,
  listFiles,
  listFilesBatch,
  openEntryInExternalApp,
  readExternalClipboardSourcePaths,
  readFile,
  renameEntry,
  writeFile,
} from "./fileCommands";

const mocks = vi.hoisted(() => ({
  createFile: vi.fn(),
  createFolder: vi.fn(),
  deleteEntry: vi.fn(),
  listFiles: vi.fn(),
  listFilesBatch: vi.fn(),
  openEntryInExternalApp: vi.fn(),
  readExternalClipboardSourcePaths: vi.fn(),
  readFile: vi.fn(),
  renameEntry: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    file: {
      createFile: mocks.createFile,
      createFolder: mocks.createFolder,
      deleteEntry: mocks.deleteEntry,
      listFiles: mocks.listFiles,
      listFilesBatch: mocks.listFilesBatch,
      openEntryInExternalApp: mocks.openEntryInExternalApp,
      readExternalClipboardSourcePaths: mocks.readExternalClipboardSourcePaths,
      readFile: mocks.readFile,
      renameEntry: mocks.renameEntry,
      writeFile: mocks.writeFile,
    },
  })),
  getDesktopHostBridge: vi.fn(() => ({
    openEntryInExternalApp: mocks.openEntryInExternalApp,
    readExternalClipboardSourcePaths: mocks.readExternalClipboardSourcePaths,
  })),
}));

describe("fileCommands", () => {
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
    expect(mocks.createFile).toHaveBeenCalledWith({
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
    expect(mocks.readExternalClipboardSourcePaths).toHaveBeenCalledTimes(1);
  });
});
