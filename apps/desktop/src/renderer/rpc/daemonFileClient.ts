import type * as Rpc from "./daemonTypes";
import {
  asRecord,
  readOptionalBoolean,
  readOptionalString,
} from "./helpers";
import { getErrorMessage } from "../helpers/errorHelpers";

type InvokeFn = (method: string, params?: unknown) => Promise<unknown>;

/** Normalizes daemon file-entry paths so directories always keep a trailing slash. */
function normalizeDaemonFileEntries(files: Rpc.DaemonFileEntry[]): Rpc.DaemonFileEntry[] {
  return files.map((entry) => {
    const trimmedPath = entry.path.replace(/\\/g, "/").replace(/\/+$/, "");
    return {
      ...entry,
      path: entry.isDir ? `${trimmedPath}/` : trimmedPath,
    };
  });
}

/** File namespace methods for the daemon RPC client. */
export class DaemonFileClient {
  private readonly invoke: InvokeFn;
  private readonly resolveWorkspaceId: (input: unknown) => Promise<string>;

  constructor(invoke: InvokeFn, resolveWorkspaceId: (input: unknown) => Promise<string>) {
    this.invoke = invoke;
    this.resolveWorkspaceId = resolveWorkspaceId;
  }

  async listFiles(input: Rpc.FileListInput): Promise<Rpc.FileListResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath) || "";
    const recursive = readOptionalBoolean(record?.recursive) ?? true;
    const files = await this.invoke("file.list", { workspaceId, path: relativePath, recursive });
    return {
      files: Array.isArray(files) ? normalizeDaemonFileEntries(files as Rpc.FileListResponse["files"]) : [],
    };
  }

  async listFilesBatch(input: Rpc.FileListBatchInput): Promise<Rpc.FileListBatchResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const requests = Array.isArray(record?.requests) ? record.requests : [];
    const results = await Promise.all(
      requests.map(async (request) => {
        const requestRecord = asRecord(request) ?? {};
        const relativePath = readOptionalString(requestRecord.relativePath) || "";
        const recursive = readOptionalBoolean(requestRecord.recursive) ?? false;
        try {
          const files = await this.invoke("file.list", { workspaceId, path: relativePath, recursive });
          return {
            request: { relativePath, recursive },
            files: Array.isArray(files) ? normalizeDaemonFileEntries(files as Rpc.FileListResponse["files"]) : [],
          };
        } catch (error) {
          return {
            request: { relativePath, recursive },
            files: [],
            error: getErrorMessage(error),
          };
        }
      }),
    );
    return { results };
  }

  async readFile(input: Rpc.FileReadInput): Promise<Rpc.FileReadResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    const content = await this.invoke("file.read", { workspaceId, path: relativePath });
    return { content: typeof content === "string" ? content : "" };
  }

  async writeFile(input: Rpc.FileWriteInput): Promise<Rpc.FileWriteResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    const content = typeof record?.content === "string" ? record.content : "";
    const written = await this.invoke("file.write", { workspaceId, path: relativePath, content });
    return { ok: true, written: typeof written === "number" ? written : 0 };
  }

  async createFolder(input: Rpc.FileCreateFolderInput): Promise<Rpc.FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    await this.invoke("file.mkdir", { workspaceId, path: relativePath, parents: true });
    return { ok: true };
  }

  async renameEntry(input: Rpc.FileRenameInput): Promise<Rpc.FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const fromRelativePath = readOptionalString(record?.fromRelativePath);
    const toRelativePath = readOptionalString(record?.toRelativePath);
    if (!fromRelativePath || !toRelativePath) {
      throw new Error("fromRelativePath and toRelativePath are required");
    }
    await this.invoke("file.move", { workspaceId, fromPath: fromRelativePath, toPath: toRelativePath });
    return { ok: true };
  }

  async deleteEntry(input: Rpc.FileDeleteInput): Promise<Rpc.FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    await this.invoke("file.delete", { workspaceId, path: relativePath, recursive: true });
    return { ok: true };
  }

  async readDiff(input: Rpc.FileReadInput): Promise<Rpc.FileDiffResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveWorkspaceId(input);
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    const result = await this.invoke("file.diff", { workspaceId, path: relativePath });
    const data = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
    return {
      oldContent: typeof data.oldContent === "string" ? data.oldContent : "",
      newContent: typeof data.newContent === "string" ? data.newContent : "",
    };
  }
}
