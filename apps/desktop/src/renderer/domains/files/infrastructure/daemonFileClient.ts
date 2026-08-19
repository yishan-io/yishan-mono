import { getErrorMessage } from "../../../helpers/errorHelpers";
import { asRecord, readOptionalBoolean, readOptionalString } from "../../../rpc/helpers";
import { getDaemonTransport } from "../../../rpc/rpcTransport";

/**
 * File wire DTOs (desktop7 Phase 25). Owned by the Files Domain
 * Infrastructure; the daemon payload shapes are the transport contract.
 */

export type DaemonFileEntry = {
  path: string;
  name: string;
  isDir: boolean;
  isIgnored: boolean;
  size: number;
  mode: number;
  modifiedAt: string;
};

export type FileListInput = {
  workspaceId: string;
  relativePath?: string;
  recursive?: boolean;
};

export type FileListBatchInput = {
  workspaceId: string;
  requests: Array<{
    relativePath?: string;
    recursive?: boolean;
  }>;
};

export type FileSearchInput = {
  workspaceId: string;
  query: string;
  limit?: number;
  includeDirectories?: boolean;
};

export type FileReadInput = {
  workspaceId: string;
  relativePath: string;
};

export type FileWriteInput = {
  workspaceId: string;
  relativePath: string;
  content: string;
};

export type FileCreateFolderInput = {
  workspaceId: string;
  relativePath: string;
};

export type FileRenameInput = {
  workspaceId: string;
  fromRelativePath: string;
  toRelativePath: string;
};

export type FileDeleteInput = {
  workspaceId: string;
  relativePath: string;
};

export type FileListResponse = {
  files: DaemonFileEntry[];
};

export type FileSearchResult = {
  path: string;
  score: number;
  highlightedPathIndexes: number[];
  isDirectory?: boolean;
};

export type FileListBatchResponse = {
  results: Array<{
    request: {
      relativePath: string;
      recursive: boolean;
    };
    files: DaemonFileEntry[];
    error?: string;
  }>;
};

export type FileReadResponse = {
  content: string;
};

export type FileWriteResponse = {
  ok: true;
  written: number;
};

export type FileMutationOkResponse = {
  ok: true;
};

export type FileDiffResponse = {
  oldContent: string;
  newContent: string;
  shouldSkipDecorations?: boolean;
};

type InvokeFn = (method: string, params?: unknown) => Promise<unknown>;

/** Normalizes daemon file-entry paths so directories always keep a trailing slash. */
function normalizeDaemonFileEntries(files: DaemonFileEntry[]): DaemonFileEntry[] {
  return files.map((entry) => {
    const trimmedPath = entry.path.replace(/\\/g, "/").replace(/\/+$/, "");
    return {
      ...entry,
      isIgnored: entry.isIgnored ?? false,
      path: entry.isDir ? `${trimmedPath}/` : trimmedPath,
    };
  });
}

/** File namespace methods for the daemon RPC client. */
export class DaemonFileClient {
  private readonly invoke: InvokeFn;

  constructor(invoke: InvokeFn) {
    this.invoke = invoke;
  }

  async listFiles(input: FileListInput): Promise<FileListResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
    const relativePath = readOptionalString(record?.relativePath) || "";
    const recursive = readOptionalBoolean(record?.recursive) ?? true;
    const files = await this.invoke("file.list", { workspaceId, path: relativePath, recursive });
    return {
      files: Array.isArray(files) ? normalizeDaemonFileEntries(files as FileListResponse["files"]) : [],
    };
  }

  async listFilesBatch(input: FileListBatchInput): Promise<FileListBatchResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
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
            files: Array.isArray(files) ? normalizeDaemonFileEntries(files as FileListResponse["files"]) : [],
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

  async searchFiles(input: FileSearchInput): Promise<FileSearchResult[]> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
    const query = readOptionalString(record?.query)?.trim() ?? "";
    if (!query) {
      return [];
    }

    const limit = typeof record?.limit === "number" && Number.isFinite(record.limit) ? record.limit : 100;
    const includeDirectories = readOptionalBoolean(record?.includeDirectories) ?? false;
    const results = await this.invoke("file.search", { workspaceId, query, limit, includeDirectories });
    return Array.isArray(results) ? (results as FileSearchResult[]) : [];
  }

  async readFile(input: FileReadInput): Promise<FileReadResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    const result = await this.invoke("file.read", { workspaceId, path: relativePath });
    // Daemon returns { content: string }
    const content = readOptionalString(asRecord(result)?.content) ?? "";
    return { content };
  }

  async writeFile(input: FileWriteInput): Promise<FileWriteResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    const content = typeof record?.content === "string" ? record.content : "";
    const written = await this.invoke("file.write", { workspaceId, path: relativePath, content });
    return { ok: true, written: typeof written === "number" ? written : 0 };
  }

  async createFolder(input: FileCreateFolderInput): Promise<FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    await this.invoke("file.mkdir", { workspaceId, path: relativePath, parents: true });
    return { ok: true };
  }

  async renameEntry(input: FileRenameInput): Promise<FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
    const fromRelativePath = readOptionalString(record?.fromRelativePath);
    const toRelativePath = readOptionalString(record?.toRelativePath);
    if (!fromRelativePath || !toRelativePath) {
      throw new Error("fromRelativePath and toRelativePath are required");
    }
    await this.invoke("file.move", { workspaceId, fromPath: fromRelativePath, toPath: toRelativePath });
    return { ok: true };
  }

  async deleteEntry(input: FileDeleteInput): Promise<FileMutationOkResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
    const relativePath = readOptionalString(record?.relativePath);
    if (!relativePath) {
      throw new Error("relativePath is required");
    }
    await this.invoke("file.delete", { workspaceId, path: relativePath, recursive: true });
    return { ok: true };
  }

  async readDiff(input: FileReadInput): Promise<FileDiffResponse> {
    const record = asRecord(input);
    const workspaceId = readOptionalString(record?.workspaceId);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
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

let cachedFileRpc: DaemonFileClient | null = null;

/**
 * Lazily resolves the files Domain RPC adapter over the root transport
 * (dependency direction: Domain RPC adapter → root RPC transport).
 */
export async function getFileRpc(): Promise<DaemonFileClient> {
  if (!cachedFileRpc) {
    cachedFileRpc = new DaemonFileClient((await getDaemonTransport()).invoke);
  }
  return cachedFileRpc;
}
