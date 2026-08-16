import type { WorkspaceTab } from "../../../store/types";

/**
 * Returns true when deletedPath should be treated as a directory in the current file listing.
 */
export function isDeletedPathDirectory(files: string[], deletedPath: string): boolean {
  const normalized = deletedPath.replace(/\/+$/, "");
  const prefix = `${normalized}/`;

  return files.some((filePath) => {
    const normalizedFilePath = filePath.replace(/\\/g, "/");
    return normalizedFilePath === `${normalized}/` || normalizedFilePath.startsWith(prefix);
  });
}

/**
 * Resolves tab ids that should close after deleting a file or directory path.
 */
export function resolveTabIdsToCloseAfterDelete(
  tabs: WorkspaceTab[],
  deletedPath: string,
  isDirectory: boolean,
): string[] {
  const normalizedDeletedPath = deletedPath.replace(/\/+$/, "");
  const directoryPrefix = `${normalizedDeletedPath}/`;

  return tabs
    .filter((tab) => tab.kind === "file" || tab.kind === "diff")
    .filter((tab) => {
      const normalizedTabPath = tab.data.path.replace(/\\/g, "/").replace(/\/+$/, "");
      if (isDirectory) {
        return normalizedTabPath === normalizedDeletedPath || normalizedTabPath.startsWith(directoryPrefix);
      }

      return normalizedTabPath === normalizedDeletedPath;
    })
    .map((tab) => tab.id);
}
