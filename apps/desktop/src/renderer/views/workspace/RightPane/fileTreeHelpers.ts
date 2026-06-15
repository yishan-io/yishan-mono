import type { ExternalClipboardReadOutcome, WorkspaceFileEntry } from "../../../../shared/contracts/rpcRequestTypes";
import { generateId } from "../../../helpers/generateId";
import type { ClipboardFilePayload } from "./clipboardSourceResolvers";

export const LARGE_FILE_OPEN_THRESHOLD_BYTES = 2 * 1024 * 1024;

export function resolveWorkspaceAbsolutePath(worktreePath: string, relativePath: string): string {
  const trimmedRoot = worktreePath.replace(/\/+$/, "");
  const trimmedRelative = relativePath.replace(/^\/+/, "");
  return `${trimmedRoot}/${trimmedRelative}`;
}

export function getFileOperationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createOperationId(): string {
  return generateId();
}

export function mapWorkspaceEntryPaths(entries: WorkspaceFileEntry[]): string[] {
  return entries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
}

export function mapIgnoredWorkspaceEntryPaths(entries: WorkspaceFileEntry[]): string[] {
  return entries
    .filter((entry) => entry.isIgnored)
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function getUtf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }

  return value.length;
}

function resolveExtensionFromMimeType(mimeType: string): string {
  const normalizedType = mimeType.toLowerCase();

  if (normalizedType === "image/png") {
    return "png";
  }

  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg") {
    return "jpg";
  }

  if (normalizedType === "image/gif") {
    return "gif";
  }

  if (normalizedType === "image/webp") {
    return "webp";
  }

  if (normalizedType === "image/svg+xml") {
    return "svg";
  }

  if (normalizedType === "application/pdf") {
    return "pdf";
  }

  const slashIndex = normalizedType.indexOf("/");
  if (slashIndex < 0 || slashIndex === normalizedType.length - 1) {
    return "bin";
  }

  return normalizedType.slice(slashIndex + 1).replace(/[^a-z0-9]/g, "") || "bin";
}

export async function resolveExternalClipboardFilePayloads(): Promise<ClipboardFilePayload[]> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.read !== "function") {
    return [];
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    const filePayloads: ClipboardFilePayload[] = [];
    let payloadIndex = 1;

    for (const clipboardItem of clipboardItems) {
      for (const type of clipboardItem.types) {
        const normalizedType = type.toLowerCase();
        const isBinaryPayload = normalizedType.startsWith("image/") || normalizedType === "application/pdf";
        if (!isBinaryPayload) {
          continue;
        }

        const blob = await clipboardItem.getType(type);
        if (blob.size === 0) {
          continue;
        }

        const extension = resolveExtensionFromMimeType(blob.type || type);
        const relativePath = `pasted-${payloadIndex}.${extension}`;
        payloadIndex += 1;

        filePayloads.push({
          relativePath,
          contentBase64: arrayBufferToBase64(await blob.arrayBuffer()),
        });
      }
    }

    return filePayloads;
  } catch (error) {
    console.warn("Failed to read clipboard file payloads for external file paste", error);
    return [];
  }
}

export function reportNativeExternalClipboardOutcome(outcome: ExternalClipboardReadOutcome): void {
  if (outcome.kind === "success") {
    console.info("Native external clipboard read succeeded", {
      strategy: outcome.strategy,
      sourcePathCount: outcome.sourcePaths.length,
      clipboardFormats: outcome.clipboardFormats,
    });
    return;
  }

  if (outcome.kind === "supported" || outcome.kind === "empty") {
    console.info("Native external clipboard read produced no source paths", {
      kind: outcome.kind,
      strategy: outcome.strategy,
      clipboardFormats: outcome.clipboardFormats,
    });
    return;
  }

  console.warn("Native external clipboard read failed", {
    kind: outcome.kind,
    strategy: outcome.strategy,
    clipboardFormats: outcome.clipboardFormats,
    message: "message" in outcome ? outcome.message : undefined,
  });
}
