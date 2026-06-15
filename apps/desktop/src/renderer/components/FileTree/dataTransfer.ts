import type { DragEvent } from "react";
import { extractPathsFromClipboardText } from "../../../shared/fileClipboardPaths";

/**
 * Custom MIME type used to identify drags originating from the internal file tree.
 * The payload is a JSON-encoded array of absolute file paths.
 */
export const FILETREE_DRAG_MIME = "application/x-filetree-paths";

/** Returns true when drag metadata indicates an internal file-tree drag (identified by {@link FILETREE_DRAG_MIME}). */
export function hasInternalFileTreeDragIntent(event: DragEvent<HTMLElement>): boolean {
  return Boolean(event.dataTransfer?.types.includes(FILETREE_DRAG_MIME));
}

/**
 * Extracts relative file paths from an internal file-tree drag payload.
 * The payload contains absolute paths; this function strips the worktree prefix
 * to return workspace-relative paths.
 */
export function extractInternalDragRelativePaths(dataTransfer: DataTransfer, worktreePath: string): string[] {
  const raw = dataTransfer.getData(FILETREE_DRAG_MIME);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const prefix = worktreePath.endsWith("/") ? worktreePath : `${worktreePath}/`;
    return parsed
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .map((absolutePath) => (absolutePath.startsWith(prefix) ? absolutePath.slice(prefix.length) : absolutePath))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Returns true when drag metadata indicates one or more external filesystem entries are included.
 *  Returns false for internal file-tree drags (identified by {@link FILETREE_DRAG_MIME}). */
export function hasExternalFileDragIntent(event: DragEvent<HTMLElement>): boolean {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return false;
  }

  // Internal file-tree drags are not external file drops — reject early.
  if (dataTransfer.types.includes(FILETREE_DRAG_MIME)) {
    return false;
  }

  if (dataTransfer.files.length > 0) {
    return true;
  }

  const hasFileItems = Array.from(dataTransfer.items).some((item) => item.kind === "file");
  if (hasFileItems) {
    return true;
  }

  const payloadTypes = new Set([...(dataTransfer.types ?? [])].map((value) => value.toLowerCase()));
  if (payloadTypes.has("files")) {
    return true;
  }

  return [...payloadTypes].some((type) => type.includes("file") || type.includes("uri"));
}

/** Extracts absolute filesystem paths from one sync drag/drop/clipboard payload. */
export function extractSourcePathsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const getData = (type: string): string => {
    if (typeof dataTransfer.getData !== "function") {
      return "";
    }

    return dataTransfer.getData(type) || "";
  };

  // Use Electron's webUtils.getPathForFile (exposed via preload) to resolve OS file paths.
  // This is required because with contextIsolation enabled, File.path is not available.
  const getFilePath = (file: File): string => {
    if (window.desktop?.getPathForFile) {
      try {
        return window.desktop.getPathForFile(file)?.trim() ?? "";
      } catch {
        return "";
      }
    }

    // Fallback for environments without the preload (e.g., tests)
    return (file as File & { path?: string }).path?.trim() ?? "";
  };

  const filePaths = Array.from(dataTransfer.files).map(getFilePath).filter(Boolean);
  const itemPaths = Array.from(dataTransfer.items)
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null)
    .map(getFilePath)
    .filter(Boolean);
  const uriListPaths = extractPathsFromClipboardText(getData("text/uri-list"));
  const textPlainPaths = extractPathsFromClipboardText(getData("text/plain"));

  return [...new Set([...filePaths, ...itemPaths, ...uriListPaths, ...textPlainPaths])];
}

/** Reads one data-transfer item as string and returns empty text when unsupported. */
async function readDataTransferItemAsString(item: DataTransferItem): Promise<string> {
  if (typeof item.getAsString !== "function") {
    return "";
  }

  return new Promise<string>((resolve) => {
    try {
      item.getAsString((value) => {
        resolve(value ?? "");
      });
    } catch {
      resolve("");
    }
  });
}

/** Extracts absolute filesystem paths from sync and async data-transfer sources. */
export async function extractSourcePathsFromDataTransferAsync(dataTransfer: DataTransfer): Promise<string[]> {
  const sourcePathSet = new Set(extractSourcePathsFromDataTransfer(dataTransfer));
  const clipboardItems = Array.from(dataTransfer.items ?? []);

  for (const item of clipboardItems) {
    if (item.kind !== "string") {
      continue;
    }

    const normalizedType = item.type.toLowerCase();
    const shouldReadTextPayload =
      normalizedType.startsWith("text/") || normalizedType.includes("uri") || normalizedType.includes("file-url");
    if (!shouldReadTextPayload) {
      continue;
    }

    const value = await readDataTransferItemAsString(item);
    if (!value.trim()) {
      continue;
    }

    for (const path of extractPathsFromClipboardText(value)) {
      sourcePathSet.add(path);
    }
  }

  return [...sourcePathSet];
}
