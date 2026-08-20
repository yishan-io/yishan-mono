import type { ExternalAppId, WorkspaceEntryAppId } from "../../shared/contracts/externalApps";
import type { ExternalClipboardReadOutcome } from "../../shared/contracts/rpcRequestTypes";

export type OpenEntryInExternalAppInput = {
  workspaceWorktreePath: string;
  appId: WorkspaceEntryAppId;
  relativePath?: string;
};

export type OpenExternalUrlInput = {
  url: string;
};

export type OpenExternalUrlResult =
  | { opened: true }
  | {
      opened: false;
      reason: "invalid-url" | "unsupported-protocol" | "open-failed";
    };

export type { ExternalAppId, ExternalClipboardReadOutcome };

export type CopyFilesInput = {
  /** Absolute source paths to copy from (external OS paths). */
  sourcePaths: string[];
  /** Absolute path of the destination directory to copy into. */
  destinationDirectory: string;
};

export type CopyFilesResult = { ok: true; copiedPaths: string[] } | { ok: false; error: string };

export type ResolveRealPathResult = {
  path: string;
};

export type WriteFileBase64Input = {
  /** Absolute path of the file to write. */
  absolutePath: string;
  /** Base64-encoded file content. */
  contentBase64: string;
};

export type WriteFileBase64Result = { ok: true } | { ok: false; error: string };
