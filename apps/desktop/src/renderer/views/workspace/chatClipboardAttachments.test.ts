import { describe, expect, it, vi } from "vitest";
import {
  CHAT_ATTACHMENT_DIRECTORY,
  hasClipboardFileIntent,
  resolveChatClipboardAttachmentPaths,
} from "./chatClipboardAttachments";

const mocks = vi.hoisted(() => ({
  extractSourcePathsFromDataTransferAsync: vi.fn<() => Promise<string[]>>(),
}));

vi.mock("../../components/FileTree/dataTransfer", () => ({
  extractSourcePathsFromDataTransferAsync: mocks.extractSourcePathsFromDataTransferAsync,
}));

describe("chatClipboardAttachments", () => {
  it("detects file-like clipboard payloads", () => {
    expect(
      hasClipboardFileIntent({
        files: [] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
        types: ["text/plain"],
      }),
    ).toBe(false);

    expect(
      hasClipboardFileIntent({
        files: [] as unknown as FileList,
        items: [{ kind: "file" }] as unknown as DataTransferItemList,
        types: ["text/plain"],
      }),
    ).toBe(true);

    expect(
      hasClipboardFileIntent({
        files: [] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
        types: ["text/uri-list"],
      }),
    ).toBe(true);
  });

  it("copies external pasted file paths into a stable workspace directory", async () => {
    mocks.extractSourcePathsFromDataTransferAsync.mockResolvedValueOnce(["/var/folders/tmp/simulator.png"]);
    const copyFilesImpl = vi.fn().mockResolvedValue({
      ok: true,
      copiedPaths: ["/repo/.yishan/chat-attachments/paste-1/1/simulator.png"],
    });

    const result = await resolveChatClipboardAttachmentPaths({
      clipboardData: {
        files: [] as unknown as FileList,
        items: [{ kind: "file" }] as unknown as DataTransferItemList,
        types: ["text/uri-list"],
      } as unknown as DataTransfer,
      workspaceWorktreePath: "/repo",
      copyFilesImpl,
      createOperationId: () => "paste-1",
    });

    expect(copyFilesImpl).toHaveBeenCalledWith({
      sourcePaths: ["/var/folders/tmp/simulator.png"],
      destinationDirectory: `/repo/${CHAT_ATTACHMENT_DIRECTORY}/paste-1/1`,
    });
    expect(result).toEqual(["/repo/.yishan/chat-attachments/paste-1/1/simulator.png"]);
  });

  it("keeps existing workspace paths without duplicating them", async () => {
    mocks.extractSourcePathsFromDataTransferAsync.mockResolvedValueOnce(["/repo/screenshots/fix.png"]);
    const copyFilesImpl = vi.fn();

    const result = await resolveChatClipboardAttachmentPaths({
      clipboardData: {
        files: [] as unknown as FileList,
        items: [{ kind: "file" }] as unknown as DataTransferItemList,
        types: ["files"],
      } as unknown as DataTransfer,
      workspaceWorktreePath: "/repo",
      copyFilesImpl,
    });

    expect(copyFilesImpl).not.toHaveBeenCalled();
    expect(result).toEqual(["/repo/screenshots/fix.png"]);
  });

  it("persists binary clipboard payloads when no source path is available", async () => {
    mocks.extractSourcePathsFromDataTransferAsync.mockResolvedValueOnce([]);
    const writeFileBase64Impl = vi.fn().mockResolvedValue({ ok: true });

    const result = await resolveChatClipboardAttachmentPaths({
      clipboardData: {
        files: [] as unknown as FileList,
        items: [{ kind: "file" }] as unknown as DataTransferItemList,
        types: ["image/png"],
      } as unknown as DataTransfer,
      workspaceWorktreePath: "/repo",
      writeFileBase64Impl,
      resolveExternalClipboardFilePayloadsImpl: async () => [
        {
          relativePath: "pasted-1.png",
          contentBase64: "ZmFrZQ==",
        },
      ],
      createOperationId: () => "paste-2",
    });

    expect(writeFileBase64Impl).toHaveBeenCalledWith({
      absolutePath: `/repo/${CHAT_ATTACHMENT_DIRECTORY}/paste-2/pasted-1-1.png`,
      contentBase64: "ZmFrZQ==",
    });
    expect(result).toEqual([`/repo/${CHAT_ATTACHMENT_DIRECTORY}/paste-2/pasted-1-1.png`]);
  });
});
