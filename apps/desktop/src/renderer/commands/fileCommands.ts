import type { WorkspaceEntryAppId } from "../../shared/contracts/externalApps";
import type { ExternalClipboardReadOutcome } from "../../shared/contracts/rpcRequestTypes";
import { getDaemonClient, getDesktopHostBridge } from "../rpc/rpcTransport";

/** Lists workspace files under one optional directory path, recursively by default. */
export async function listFiles(params: { workspaceWorktreePath: string; relativePath?: string; recursive?: boolean }) {
  const client = await getDaemonClient();
  return client.file.listFiles({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePath: params.relativePath,
    recursive: params.recursive,
  });
}

/** Lists workspace files for multiple directory requests in one batch call. */
export async function listFilesBatch(params: {
  workspaceWorktreePath: string;
  requests: Array<{
    relativePath?: string;
    recursive?: boolean;
  }>;
}) {
  const client = await getDaemonClient();
  return client.file.listFilesBatch({
    workspaceWorktreePath: params.workspaceWorktreePath,
    requests: params.requests,
  });
}

/** Reads one file from one workspace worktree path. */
export async function readFile(params: { workspaceWorktreePath: string; relativePath: string }) {
  const client = await getDaemonClient();
  return client.file.readFile({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePath: params.relativePath,
  });
}

/** Writes one file into one workspace worktree path. */
export async function writeFile(params: {
  workspaceWorktreePath: string;
  relativePath: string;
  content: string;
}) {
  const client = await getDaemonClient();
  return client.file.writeFile({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePath: params.relativePath,
    content: params.content,
  });
}

/** Creates one file inside one workspace worktree path. */
export async function createFile(params: {
  workspaceWorktreePath: string;
  relativePath: string;
  content: string;
}) {
  const client = await getDaemonClient();
  return client.file.createFile({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePath: params.relativePath,
    content: params.content,
  });
}

/** Creates one folder inside one workspace worktree path. */
export async function createFolder(params: { workspaceWorktreePath: string; relativePath: string }) {
  const client = await getDaemonClient();
  return client.file.createFolder({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePath: params.relativePath,
  });
}

/** Renames one file-system entry in one workspace worktree path. */
export async function renameEntry(params: {
  workspaceWorktreePath: string;
  fromRelativePath: string;
  toRelativePath: string;
}) {
  const client = await getDaemonClient();
  return client.file.renameEntry({
    workspaceWorktreePath: params.workspaceWorktreePath,
    fromRelativePath: params.fromRelativePath,
    toRelativePath: params.toRelativePath,
  });
}

/** Deletes one file-system entry in one workspace worktree path. */
export async function deleteEntry(params: { workspaceWorktreePath: string; relativePath: string }) {
  const client = await getDaemonClient();
  return client.file.deleteEntry({
    workspaceWorktreePath: params.workspaceWorktreePath,
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

/** Copies or moves one or more workspace entries into a destination path. */
export async function pasteEntries(params: {
  workspaceWorktreePath: string;
  sourceRelativePaths: string[];
  destinationRelativePath?: string;
  mode: "copy" | "move";
}) {
  const client = await getDaemonClient();
  return client.file.pasteEntries({
    workspaceWorktreePath: params.workspaceWorktreePath,
    sourceRelativePaths: params.sourceRelativePaths,
    destinationRelativePath: params.destinationRelativePath,
    mode: params.mode,
  });
}

/** Imports external absolute paths into one workspace destination path. */
export async function importEntries(params: {
  workspaceWorktreePath: string;
  sourcePaths: string[];
  destinationRelativePath?: string;
}) {
  const client = await getDaemonClient();
  return client.file.importEntries({
    workspaceWorktreePath: params.workspaceWorktreePath,
    sourcePaths: params.sourcePaths,
    destinationRelativePath: params.destinationRelativePath,
  });
}

/** Imports dropped payload blobs into one workspace destination path. */
export async function importFilePayloads(params: {
  workspaceWorktreePath: string;
  filePayloads: Array<{
    relativePath: string;
    contentBase64: string;
  }>;
  destinationRelativePath?: string;
}) {
  const client = await getDaemonClient();
  return client.file.importFilePayloads({
    workspaceWorktreePath: params.workspaceWorktreePath,
    filePayloads: params.filePayloads,
    destinationRelativePath: params.destinationRelativePath,
  });
}
