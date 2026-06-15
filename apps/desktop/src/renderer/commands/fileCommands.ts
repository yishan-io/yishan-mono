import type { WorkspaceEntryAppId } from "../../shared/contracts/externalApps";
import type { ExternalClipboardReadOutcome } from "../../shared/contracts/rpcRequestTypes";
import { getDaemonClient, getDesktopHostBridge } from "../rpc/rpcTransport";

const WORKSPACE_FILE_PROTOCOL_URL = "yishan-file://workspace-image";

/** Lists workspace files under one optional directory path, recursively by default. */
export async function listFiles(params: {
  workspaceId: string;
  relativePath?: string;
  recursive?: boolean;
}) {
  const client = await getDaemonClient();
  return client.file.listFiles({
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
  const client = await getDaemonClient();
  return client.file.listFilesBatch({
    workspaceId: params.workspaceId,
    requests: params.requests,
  });
}

/** Searches workspace files through the daemon quick-open backend. */
export async function searchFiles(params: { workspaceId: string; query: string; limit?: number }) {
  const client = await getDaemonClient();
  return client.file.searchFiles({
    workspaceId: params.workspaceId,
    query: params.query,
    limit: params.limit,
  });
}

/** Reads one file from one workspace worktree path. */
export async function readFile(params: { workspaceId: string; relativePath: string }) {
  const client = await getDaemonClient();
  return client.file.readFile({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
  });
}

/** Writes one file into one workspace worktree path. */
export async function writeFile(params: {
  workspaceId: string;
  relativePath: string;
  content: string;
}) {
  const client = await getDaemonClient();
  return client.file.writeFile({
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
  const client = await getDaemonClient();
  return client.file.createFile({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
    content: params.content,
  });
}

/** Creates one folder inside one workspace worktree path. */
export async function createFolder(params: { workspaceId: string; relativePath: string }) {
  const client = await getDaemonClient();
  return client.file.createFolder({
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
  const client = await getDaemonClient();
  return client.file.renameEntry({
    workspaceId: params.workspaceId,
    fromRelativePath: params.fromRelativePath,
    toRelativePath: params.toRelativePath,
  });
}

/** Deletes one file-system entry in one workspace worktree path. */
export async function deleteEntry(params: { workspaceId: string; relativePath: string }) {
  const client = await getDaemonClient();
  return client.file.deleteEntry({
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

/** Reads absolute source paths from native clipboard APIs. */
export async function readExternalClipboardSourcePaths() {
  return (await getDesktopHostBridge().readExternalClipboardSourcePaths()) as ExternalClipboardReadOutcome;
}

/** Writes text to the system clipboard via the main process (works in file:// contexts). */
export async function writeClipboardText(text: string): Promise<void> {
  await getDesktopHostBridge().writeClipboardText(text);
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
