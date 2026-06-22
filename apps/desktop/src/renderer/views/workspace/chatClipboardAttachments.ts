import { copyFiles, writeFileBase64 } from "../../commands/fileCommands";
import { extractSourcePathsFromDataTransferAsync } from "../../components/FileTree/dataTransfer";
import { resolveExternalClipboardFilePayloads } from "./RightPane/fileTreeHelpers";
import type { ClipboardFilePayload } from "./RightPane/clipboardSourceResolvers";

export const CHAT_ATTACHMENT_DIRECTORY = ".yishan/chat-attachments";

type AttachmentClipboardData = Pick<DataTransfer, "files" | "items" | "types">;

type ResolveChatClipboardAttachmentPathsOptions = {
  clipboardData: DataTransfer;
  workspaceWorktreePath: string;
  copyFilesImpl?: typeof copyFiles;
  writeFileBase64Impl?: typeof writeFileBase64;
  resolveExternalClipboardFilePayloadsImpl?: () => Promise<ClipboardFilePayload[]>;
  createOperationId?: () => string;
};

function normalizePath(value: string): string {
  return value.trim().replace(/[\\/]+$/, "");
}

function isWorkspacePath(absolutePath: string, workspaceWorktreePath: string): boolean {
  const normalizedPath = normalizePath(absolutePath);
  const normalizedWorkspacePath = normalizePath(workspaceWorktreePath);
  return (
    normalizedPath === normalizedWorkspacePath || normalizedPath.startsWith(`${normalizedWorkspacePath}/`)
  );
}

function sanitizeFileName(name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "attachment.bin";
  }

  return trimmedName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function buildPayloadFileName(relativePath: string, index: number): string {
  const segments = relativePath.split("/").filter(Boolean);
  const rawName = segments.at(-1) ?? `attachment-${index + 1}.bin`;
  const lastDotIndex = rawName.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < rawName.length - 1;
  const name = hasExtension ? rawName.slice(0, lastDotIndex) : rawName;
  const extension = hasExtension ? rawName.slice(lastDotIndex) : "";
  return `${sanitizeFileName(name)}-${index + 1}${extension}`;
}

export function hasClipboardFileIntent(clipboardData: AttachmentClipboardData): boolean {
  if (clipboardData.files.length > 0) {
    return true;
  }

  const hasFileItems = Array.from(clipboardData.items ?? []).some((item) => item.kind === "file");
  if (hasFileItems) {
    return true;
  }

  const payloadTypes = new Set([...(clipboardData.types ?? [])].map((value) => value.toLowerCase()));
  if (payloadTypes.has("files")) {
    return true;
  }

  return [...payloadTypes].some((type) => type.includes("file") || type.includes("uri"));
}

export async function resolveChatClipboardAttachmentPaths({
  clipboardData,
  workspaceWorktreePath,
  copyFilesImpl = copyFiles,
  writeFileBase64Impl = writeFileBase64,
  resolveExternalClipboardFilePayloadsImpl = resolveExternalClipboardFilePayloads,
  createOperationId = () => crypto.randomUUID(),
}: ResolveChatClipboardAttachmentPathsOptions): Promise<string[]> {
  const trimmedWorkspaceWorktreePath = normalizePath(workspaceWorktreePath);
  if (!trimmedWorkspaceWorktreePath || !hasClipboardFileIntent(clipboardData)) {
    return [];
  }

  const sourcePaths = await extractSourcePathsFromDataTransferAsync(clipboardData);
  const uniqueSourcePaths = [...new Set(sourcePaths.map((path) => path.trim()).filter(Boolean))];
  if (uniqueSourcePaths.length > 0) {
    const attachmentPaths: string[] = [];
    const externalSourcePaths: string[] = [];

    for (const sourcePath of uniqueSourcePaths) {
      if (isWorkspacePath(sourcePath, trimmedWorkspaceWorktreePath)) {
        attachmentPaths.push(sourcePath);
      } else {
        externalSourcePaths.push(sourcePath);
      }
    }

    if (externalSourcePaths.length > 0) {
      const attachmentBatchId = createOperationId();
      for (const [index, sourcePath] of externalSourcePaths.entries()) {
        const destinationDirectory = `${trimmedWorkspaceWorktreePath}/${CHAT_ATTACHMENT_DIRECTORY}/${attachmentBatchId}/${index + 1}`;
        const result = await copyFilesImpl({
          sourcePaths: [sourcePath],
          destinationDirectory,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        attachmentPaths.push(...result.copiedPaths);
      }
    }

    return attachmentPaths;
  }

  const clipboardPayloads = await resolveExternalClipboardFilePayloadsImpl();
  if (clipboardPayloads.length === 0) {
    return [];
  }

  const attachmentBatchId = createOperationId();
  const persistedPaths: string[] = [];
  for (const [index, payload] of clipboardPayloads.entries()) {
    const fileName = buildPayloadFileName(payload.relativePath, index);
    const absolutePath = `${trimmedWorkspaceWorktreePath}/${CHAT_ATTACHMENT_DIRECTORY}/${attachmentBatchId}/${fileName}`;
    const result = await writeFileBase64Impl({
      absolutePath,
      contentBase64: payload.contentBase64,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    persistedPaths.push(absolutePath);
  }

  return persistedPaths;
}
