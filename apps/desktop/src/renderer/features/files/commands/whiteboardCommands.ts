import { openTab } from "@renderer/features/workbench";
import { createFile, listFiles } from "./fileCommands";

const WHITEBOARD_BASE_NAME = "whiteboard";
const WHITEBOARD_EXTENSION = "excalidraw";

/** Minimal valid Excalidraw scene written for a fresh whiteboard file. */
const EMPTY_WHITEBOARD_CONTENT = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "yishan",
  elements: [],
  appState: {},
  files: {},
});

/**
 * Returns the first non-colliding whiteboard path in a workspace:
 * `whiteboard.excalidraw`, then `whiteboard-2.excalidraw`, and so on.
 * Existing paths are matched case-sensitively (consistent with the file tree).
 */
export function resolveNextWhiteboardPath(existingPaths: readonly string[]): string {
  const existing = new Set(existingPaths);
  for (let index = 1; ; index += 1) {
    const candidate =
      index === 1
        ? `${WHITEBOARD_BASE_NAME}.${WHITEBOARD_EXTENSION}`
        : `${WHITEBOARD_BASE_NAME}-${index}.${WHITEBOARD_EXTENSION}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * Creates a new empty whiteboard (.excalidraw) file in the workspace root and
 * opens it as a file tab, which renders the Excalidraw editor.
 *
 * Returns the created relative path, or `null` when creation fails.
 */
export async function createNewWhiteboard(workspaceId: string): Promise<string | null> {
  try {
    const response = await listFiles({ workspaceId, relativePath: "", recursive: false });
    const existingPaths = response.files.map((entry) => entry.path);
    const relativePath = resolveNextWhiteboardPath(existingPaths);

    await createFile({
      workspaceId,
      relativePath,
      content: EMPTY_WHITEBOARD_CONTENT,
    });

    openTab({
      workspaceId,
      kind: "file",
      path: relativePath,
      content: EMPTY_WHITEBOARD_CONTENT,
    });
    return relativePath;
  } catch (error) {
    console.error("Failed to create whiteboard", error);
    return null;
  }
}
