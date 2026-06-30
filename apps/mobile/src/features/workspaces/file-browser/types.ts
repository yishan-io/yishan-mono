/**
 * Canonical file-tree entry shape used by the mobile workspace browser.
 */
export type FileBrowserEntry = {
  path: string;
  name: string;
  isDir: boolean;
  isIgnored?: boolean;
  size: number;
  mode: number;
};

/**
 * Supported preview render modes for workspace files on mobile.
 */
export type FilePreviewKind = "code" | "image" | "markdown" | "text" | "unsupported";
