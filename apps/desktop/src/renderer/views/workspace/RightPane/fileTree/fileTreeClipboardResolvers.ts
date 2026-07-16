import { readExternalClipboardSourcePaths as readExternalClipboardSourcePathsFromRpc } from "@renderer/commands/fileCommands";
import type { ExternalClipboardReadOutcome } from "@shared/contracts/rpcRequestTypes";
import { extractPathsFromClipboardText } from "@shared/fileClipboardPaths";
import { reportNativeExternalClipboardOutcome } from "../fileTreeHelpers";

/**
 * Resolves external clipboard source paths by attempting multiple strategies:
 * 1. Native clipboard API via main process (RPC)
 * 2. Web Clipboard API items read
 * 3. Web Clipboard API text read (fallback)
 *
 * Returns any resolved file paths and the native outcome for error reporting.
 */
export async function resolveExternalClipboardSourcePaths(): Promise<{
  sourcePaths: string[];
  nativeOutcome: ExternalClipboardReadOutcome | null;
}> {
  const sourcePathSet = new Set<string>();
  let nativeOutcome: ExternalClipboardReadOutcome | null = null;

  try {
    nativeOutcome = await readExternalClipboardSourcePathsFromRpc();
    reportNativeExternalClipboardOutcome(nativeOutcome);
    if (nativeOutcome.kind === "success") {
      for (const sourcePath of nativeOutcome.sourcePaths) {
        sourcePathSet.add(sourcePath);
      }
    }
  } catch (error) {
    console.warn("Failed to read native clipboard paths for external file paste", error);
  }

  if (sourcePathSet.size > 0) {
    return {
      sourcePaths: [...sourcePathSet],
      nativeOutcome,
    };
  }

  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return {
      sourcePaths: [],
      nativeOutcome,
    };
  }

  if (typeof navigator.clipboard.read === "function") {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          const normalizedType = type.toLowerCase();
          const shouldAttemptTextExtraction =
            normalizedType.startsWith("text/") ||
            normalizedType.includes("uri") ||
            normalizedType.includes("file-url") ||
            normalizedType.includes("utf8-plain-text");
          if (!shouldAttemptTextExtraction) {
            continue;
          }

          const blob = await clipboardItem.getType(type);
          const text = await blob.text();
          const paths = extractPathsFromClipboardText(text);
          for (const path of paths) {
            sourcePathSet.add(path);
          }
        }
      }
    } catch (error) {
      console.warn("Failed to read clipboard items for external file paste", error);
    }
  }

  if (sourcePathSet.size === 0 && typeof navigator.clipboard.readText === "function") {
    try {
      const text = await navigator.clipboard.readText();
      const paths = extractPathsFromClipboardText(text);
      for (const path of paths) {
        sourcePathSet.add(path);
      }
    } catch (error) {
      console.warn("Failed to read clipboard text for external file paste", error);
    }
  }

  return {
    sourcePaths: [...sourcePathSet],
    nativeOutcome,
  };
}

/**
 * Captures a snapshot of native external clipboard source paths.
 * Used to detect when an internal clipboard operation was invalidated by
 * an external clipboard write.
 */
export async function captureNativeExternalClipboardSourcePathsSnapshot(): Promise<string[] | null> {
  try {
    const nativeClipboardResult = await readExternalClipboardSourcePathsFromRpc();
    reportNativeExternalClipboardOutcome(nativeClipboardResult);
    if (nativeClipboardResult.kind === "success") {
      return nativeClipboardResult.sourcePaths;
    }

    if (nativeClipboardResult.kind === "supported" || nativeClipboardResult.kind === "empty") {
      return [];
    }

    return null;
  } catch (error) {
    console.warn("Failed to capture native clipboard snapshot for internal file-tree clipboard", error);
    return null;
  }
}
