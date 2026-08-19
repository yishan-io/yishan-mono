import { getDesktopHostBridge } from "@renderer/platform/hostBridge";
import { isFileNotFoundError } from "@shared/errors/getErrorMessage";
import type { ExternalAppId, WorkspaceEntryAppId } from "../../../../shared/contracts/externalApps";
import type { ExternalClipboardReadOutcome } from "../../../../shared/contracts/rpcRequestTypes";
import type { FileSearchResult } from "../daemon/daemonFileClient";
import { getFileRpc } from "../daemon/daemonFileClient";

const WORKSPACE_FILE_PROTOCOL_URL = "yishan-file://workspace-file";

/** Lists workspace files under one optional directory path, recursively by default. */
export async function listFiles(params: {
  workspaceId: string;
  relativePath?: string;
  recursive?: boolean;
}) {
  const fileRpc = await getFileRpc();
  return fileRpc.listFiles({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
    recursive: params.recursive,
  });
}

/** Lists workspace files for multiple directory requests in one batch call. */
export async function listFilesBatch(params: {
  workspaceId: string;
  requests: Array<{
    relativePath?: string;
    recursive?: boolean;
  }>;
}) {
  const fileRpc = await getFileRpc();
  return fileRpc.listFilesBatch({
    workspaceId: params.workspaceId,
    requests: params.requests,
  });
}

/** Searches workspace files through the daemon quick-open backend. */
export async function searchFiles(params: {
  workspaceId: string;
  query: string;
  limit?: number;
  includeDirectories?: boolean;
}) {
  const fileRpc = await getFileRpc();
  return fileRpc.searchFiles({
    workspaceId: params.workspaceId,
    query: params.query,
    limit: params.limit,
    includeDirectories: params.includeDirectories,
  });
}

/** Reads one file from one workspace worktree path. */
export async function readFile(params: { workspaceId: string; relativePath: string }) {
  const fileRpc = await getFileRpc();
  return fileRpc.readFile({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
  });
}

/**
 * Resolves one path referenced in chat to a real workspace file.
 *
 * The agent sometimes emits paths that are not real relative to the workspace
 * root (e.g. it says `db/index.ts` while the file is at `src/db/index.ts`).
 * Resolution order:
 * 1. exact read at the given relative path;
 * 2. daemon file search, keeping only candidates whose path ends with the
 *    referenced path — a unique candidate is opened (verified by reading it).
 * Returns `not-found` when the path cannot be resolved unambiguously, and
 * `unavailable` for transient daemon/network failures (never guess a path for
 * those).
 */
export type ChatFileResolution =
  | { status: "found"; path: string; content: string }
  | { status: "not-found" }
  | { status: "unavailable" };

export async function resolveChatFilePath(params: {
  workspaceId: string;
  relativePath: string;
}): Promise<ChatFileResolution> {
  try {
    const response = await readFile({ workspaceId: params.workspaceId, relativePath: params.relativePath });
    return { status: "found", path: params.relativePath, content: response.content };
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      return { status: "unavailable" };
    }
  }

  try {
    const results = await searchFiles({
      workspaceId: params.workspaceId,
      query: params.relativePath,
      includeDirectories: false,
    });
    const normalizedRelativePath = params.relativePath.toLowerCase();
    const candidates = results.filter((result) => result.path.toLowerCase().endsWith(normalizedRelativePath));
    if (candidates.length !== 1) {
      return { status: "not-found" };
    }

    const candidate = candidates[0];
    if (!candidate) {
      return { status: "not-found" };
    }
    const response = await readFile({ workspaceId: params.workspaceId, relativePath: candidate.path });
    return { status: "found", path: candidate.path, content: response.content };
  } catch {
    return { status: "unavailable" };
  }
}

/** Writes one file into one workspace worktree path. */
export async function writeFile(params: {
  workspaceId: string;
  relativePath: string;
  content: string;
}) {
  const fileRpc = await getFileRpc();
  return fileRpc.writeFile({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
    content: params.content,
  });
}

/** Creates one file inside one workspace worktree path. */
export async function createFile(params: {
  workspaceId: string;
  relativePath: string;
  content: string;
}) {
  const fileRpc = await getFileRpc();
  return fileRpc.writeFile({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
    content: params.content,
  });
}

/** Creates one folder inside one workspace worktree path. */
export async function createFolder(params: { workspaceId: string; relativePath: string }) {
  const fileRpc = await getFileRpc();
  return fileRpc.createFolder({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
  });
}

/** Renames one file-system entry in one workspace worktree path. */
export async function renameEntry(params: {
  workspaceId: string;
  fromRelativePath: string;
  toRelativePath: string;
}) {
  const fileRpc = await getFileRpc();
  return fileRpc.renameEntry({
    workspaceId: params.workspaceId,
    fromRelativePath: params.fromRelativePath,
    toRelativePath: params.toRelativePath,
  });
}

/** Deletes one file-system entry in one workspace worktree path. */
export async function deleteEntry(params: { workspaceId: string; relativePath: string }) {
  const fileRpc = await getFileRpc();
  return fileRpc.deleteEntry({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
  });
}

/** Reads old/new file content for one workspace diff view (git domain consumes this). */
export async function readDiff(params: { workspaceId: string; relativePath: string }) {
  const fileRpc = await getFileRpc();
  return fileRpc.readDiff({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
  });
}

/** Opens one workspace path in one external app integration. */
export async function openEntryInExternalApp(params: {
  workspaceWorktreePath: string;
  appId: WorkspaceEntryAppId;
  relativePath?: string;
}) {
  return await getDesktopHostBridge().openEntryInExternalApp({
    workspaceWorktreePath: params.workspaceWorktreePath,
    appId: params.appId,
    relativePath: params.relativePath,
  });
}

/** Lists detected external-app ids available on the current host OS. */
export async function listDetectedExternalAppIds(): Promise<ExternalAppId[]> {
  return await getDesktopHostBridge().listDetectedExternalAppIds();
}

/** Reads absolute source paths from native clipboard APIs. */
export async function readExternalClipboardSourcePaths() {
  return (await getDesktopHostBridge().readExternalClipboardSourcePaths()) as ExternalClipboardReadOutcome;
}

/** Builds one workspace-scoped custom protocol URL for image/file previews. */
export function buildWorkspaceFileUrl(params: { workspaceWorktreePath: string; relativePath: string }) {
  const search = new URLSearchParams({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePath: params.relativePath,
  });
  return `${WORKSPACE_FILE_PROTOCOL_URL}?${search.toString()}`;
}

/** Copies external files into a destination directory via the host bridge (Node.js fs). */
export async function copyFiles(params: { sourcePaths: string[]; destinationDirectory: string }) {
  return await getDesktopHostBridge().copyFiles({
    sourcePaths: params.sourcePaths,
    destinationDirectory: params.destinationDirectory,
  });
}

/** Writes a base64-encoded file to an absolute path via the host bridge (Node.js fs). */
export async function writeFileBase64(params: { absolutePath: string; contentBase64: string }) {
  return await getDesktopHostBridge().writeFileBase64({
    absolutePath: params.absolutePath,
    contentBase64: params.contentBase64,
  });
}

export type { FileSearchResult } from "../daemon/daemonFileClient";
