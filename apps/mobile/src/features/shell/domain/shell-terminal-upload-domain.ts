const SHELL_SAFE_CHARS = /^[a-zA-Z0-9_\-./~:@]+$/;
const TERMINAL_UPLOAD_DIRECTORY = ".my-context/uploads";
const FALLBACK_IMAGE_EXTENSION = "png";

export type TerminalInsertedImagePath = {
  absolutePath: string;
  relativePath: string;
  shellInput: string;
};

/**
 * Escapes one shell path so it can be inserted into the active terminal input safely.
 */
export function escapePathForShell(path: string) {
  if (!path) {
    return "''";
  }

  if (SHELL_SAFE_CHARS.test(path)) {
    return path;
  }

  const escaped = path.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

/**
 * Builds one ignored workspace-relative path for a picked image that will be
 * referenced from terminal input.
 */
export function buildTerminalUploadRelativePath(fileName: string, mimeType: string) {
  const normalizedFileName = sanitizeUploadFileName(fileName, mimeType);
  return `${TERMINAL_UPLOAD_DIRECTORY}/${Date.now()}-${normalizedFileName}`;
}

/**
 * Joins one workspace root and one relative upload path into an absolute shell path.
 */
export function buildTerminalUploadAbsolutePath(workspaceLocalPath: string, relativePath: string) {
  const normalizedWorkspacePath = workspaceLocalPath.replace(/[\\/]+$/, "");
  if (!normalizedWorkspacePath) {
    return relativePath;
  }

  return `${normalizedWorkspacePath}/${relativePath}`;
}

/**
 * Resolves the file target and terminal input string for one picked image.
 * The terminal model stays text-only: we write the image into the workspace,
 * then paste its shell-safe path into the PTY input.
 */
export function buildTerminalInsertedImagePath(input: {
  fileName: string;
  mimeType: string;
  workspaceLocalPath: string;
}): TerminalInsertedImagePath {
  const relativePath = buildTerminalUploadRelativePath(input.fileName, input.mimeType);
  const absolutePath = buildTerminalUploadAbsolutePath(input.workspaceLocalPath, relativePath);

  return {
    absolutePath,
    relativePath,
    shellInput: `${escapePathForShell(absolutePath)} `,
  };
}

function sanitizeUploadFileName(fileName: string, mimeType: string) {
  const trimmedFileName = fileName.trim();
  const fallbackExtension = inferExtensionFromMimeType(mimeType);
  const normalizedFileName = trimmedFileName || `image.${fallbackExtension}`;
  const [baseName = "image", ...extensionParts] = normalizedFileName.split(".");
  const rawExtension = extensionParts.length > 0 ? extensionParts.join(".") : fallbackExtension;
  const safeBaseName =
    baseName
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "image";
  const safeExtension =
    rawExtension.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() || inferExtensionFromMimeType(mimeType);

  return `${safeBaseName}.${safeExtension}`;
}

function inferExtensionFromMimeType(mimeType: string) {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (normalizedMimeType === "image/jpeg") {
    return "jpg";
  }

  if (normalizedMimeType === "image/webp") {
    return "webp";
  }

  if (normalizedMimeType === "image/gif") {
    return "gif";
  }

  return FALLBACK_IMAGE_EXTENSION;
}
