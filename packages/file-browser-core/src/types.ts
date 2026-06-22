export type FileBrowserEntry = {
  path: string;
  name: string;
  isDir: boolean;
  isIgnored?: boolean;
  size: number;
  mode: number;
};

export type FilePreviewKind = "code" | "image" | "markdown" | "text" | "unsupported";
