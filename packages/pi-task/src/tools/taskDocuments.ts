import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";

import type {
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskStatus,
  UpdateLocalTaskInput,
} from "../backend/localTaskTypes";
import type { LocalTaskOperationOptions, LocalTaskOperations } from "./taskOperations";

const DOCUMENT_BASENAMES = { plan: "plan.md", notes: "notes.md", outcome: "outcome.md" } as const;

/** Context documents that can be stored for a Local Task. */
export type TaskContextDocument = keyof typeof DOCUMENT_BASENAMES;
/** Cancellation accepted by Task Context document operations. */
export type TaskDocumentOptions = { signal?: AbortSignal };
/** The daemon operations needed to locate and complete a scoped task. */
export type LocalTaskDocumentBackend = {
  getContextDetails(id: string, options?: LocalTaskOperationOptions): Promise<LocalTaskContextDetails>;
  update(
    id: string,
    input: UpdateLocalTaskInput,
    options?: LocalTaskOperationOptions,
  ): Promise<{ status: LocalTaskStatus }>;
};

type ValidatedDocumentPath = { directory: string; path: string };

const fileMutationTails = new Map<string, Promise<void>>();

/** Serializes complete mutations to one validated document path across all document instances. */
function withFileMutationQueue<T>(
  validatedDocumentPath: ValidatedDocumentPath,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = fileMutationTails.get(validatedDocumentPath.path) ?? Promise.resolve();
  const queued = previous.then(operation, operation);
  const settled = queued.then(
    () => undefined,
    () => undefined,
  );
  fileMutationTails.set(validatedDocumentPath.path, settled);
  void settled.finally(() => {
    if (fileMutationTails.get(validatedDocumentPath.path) === settled) {
      fileMutationTails.delete(validatedDocumentPath.path);
    }
  });
  return queued;
}

/** Safely reads and mutates daemon-derived Local Task Context documents. */
export class LocalTaskDocuments {
  constructor(
    private readonly metadata: Pick<LocalTaskOperations, "get">,
    private readonly backend: LocalTaskDocumentBackend,
  ) {}

  /** Reads one scoped Task Context document. */
  async read(id: string, document: TaskContextDocument, options: TaskDocumentOptions = {}): Promise<string> {
    throwIfAborted(options.signal);
    const documentPath = await this.resolveDocumentPath(id, document, options);
    throwIfAborted(options.signal);
    await assertSafeDocumentPath(documentPath.directory, documentPath.path, document);
    return readFile(documentPath.path, "utf8");
  }

  /** Atomically replaces one scoped Task Context document. */
  async write(
    id: string,
    document: TaskContextDocument,
    content: string,
    options: TaskDocumentOptions = {},
  ): Promise<void> {
    throwIfAborted(options.signal);
    const documentPath = await this.resolveDocumentPath(id, document, options);
    await withFileMutationQueue(documentPath, async () => {
      throwIfAborted(options.signal);
      await writeAtomic(documentPath.directory, documentPath.path, document, content, options.signal);
    });
  }

  /** Appends content to notes with an atomic read-modify-write operation. */
  async appendNote(id: string, content: string, options: TaskDocumentOptions = {}): Promise<void> {
    throwIfAborted(options.signal);
    const documentPath = await this.resolveDocumentPath(id, "notes", options);
    await withFileMutationQueue(documentPath, async () => {
      throwIfAborted(options.signal);
      const existingContent = await readDocumentIfPresent(documentPath.directory, documentPath.path, "notes");
      throwIfAborted(options.signal);
      await writeAtomic(
        documentPath.directory,
        documentPath.path,
        "notes",
        `${existingContent}${content}`,
        options.signal,
      );
    });
  }

  /** Stores the outcome before marking the task done; retained outcomes make failures safely retryable. */
  async finish(id: string, outcome: string, options: TaskDocumentOptions = {}): Promise<{ status: LocalTaskStatus }> {
    throwIfAborted(options.signal);
    const task =
      options.signal === undefined
        ? await this.metadata.get(id)
        : await this.metadata.get(id, { signal: options.signal });
    const documentPath = await this.resolveDocumentPath(id, "outcome", options, task);
    return withFileMutationQueue(documentPath, async () => {
      throwIfAborted(options.signal);
      await writeAtomic(documentPath.directory, documentPath.path, "outcome", outcome, options.signal);
      if (task.status === "done") return task;
      throwIfAborted(options.signal);
      try {
        return options.signal === undefined
          ? await this.backend.update(task.id, { status: "done" })
          : await this.backend.update(task.id, { status: "done" }, { signal: options.signal });
      } catch (error) {
        throw new Error("Outcome was saved, but task completion failed. Retry task_finish to mark the task done.", {
          cause: error,
        });
      }
    });
  }

  private async resolveDocumentPath(
    id: string,
    document: TaskContextDocument,
    options: TaskDocumentOptions,
    resolvedTask?: Pick<LocalTask, "id" | "status">,
  ): Promise<{ directory: string; path: string }> {
    const task =
      resolvedTask ??
      (options.signal === undefined
        ? await this.metadata.get(id)
        : await this.metadata.get(id, { signal: options.signal }));
    throwIfAborted(options.signal);
    const context =
      options.signal === undefined
        ? await this.backend.getContextDetails(task.id)
        : await this.backend.getContextDetails(task.id, { signal: options.signal });
    throwIfAborted(options.signal);
    return validateContextDocumentPath(context, document);
  }
}

/** Creates scoped Task Context document operations from metadata and the daemon client. */
export function createLocalTaskDocuments(
  metadata: Pick<LocalTaskOperations, "get">,
  backend: LocalTaskDocumentBackend,
): LocalTaskDocuments {
  return new LocalTaskDocuments(metadata, backend);
}

/** Validates a daemon-derived context document path before filesystem access. */
export function validateContextDocumentPath(
  context: LocalTaskContextDetails,
  document: TaskContextDocument,
): ValidatedDocumentPath {
  const directory = context.directory;
  const requiredBasename = DOCUMENT_BASENAMES[document];
  const path = join(directory, requiredBasename);
  if (
    hasNul(directory) ||
    hasNul(path) ||
    !isAbsolute(directory) ||
    !isAbsolute(path) ||
    normalize(directory) !== directory ||
    normalize(path) !== path ||
    dirname(path) !== directory ||
    basename(path) !== requiredBasename ||
    resolve(path) !== join(directory, requiredBasename)
  ) {
    throw new Error("Invalid Local Task context document path.");
  }
  return { directory, path };
}

function hasNul(path: string): boolean {
  return path.includes("\0");
}

async function readDocumentIfPresent(directory: string, path: string, document: TaskContextDocument): Promise<string> {
  await assertSafeDocumentPath(directory, path, document);
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (isMissingPath(error)) return "";
    throw error;
  }
}

async function writeAtomic(
  directory: string,
  path: string,
  document: TaskContextDocument,
  content: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  await assertSafeDocumentPath(directory, path, document);
  await mkdir(directory, { recursive: true });
  await assertSafeDocumentPath(directory, path, document);
  throwIfAborted(signal);
  const temporaryDirectory = await mkdtemp(join(directory, ".local-task-document-"));
  const temporaryPath = join(temporaryDirectory, DOCUMENT_BASENAMES[document]);
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    throwIfAborted(signal);
    await assertSafeDocumentPath(directory, path, document);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function assertSafeDocumentPath(directory: string, path: string, document: TaskContextDocument): Promise<void> {
  await assertExistingAncestorsAreNotSymlinks(directory);
  try {
    const documentStats = await lstat(path);
    if (documentStats.isSymbolicLink()) throw new Error("Local Task context document must not be a symbolic link.");
  } catch (error: unknown) {
    if (!isMissingPath(error)) throw error;
  }
  if (dirname(path) !== directory || basename(path) !== DOCUMENT_BASENAMES[document]) {
    throw new Error("Invalid Local Task context document path.");
  }
}

async function assertExistingAncestorsAreNotSymlinks(directory: string): Promise<void> {
  let ancestor = directory;
  while (true) {
    try {
      const ancestorStats = await lstat(ancestor);
      if (ancestorStats.isSymbolicLink())
        throw new Error("Local Task context directory must not contain a symbolic link.");
      if (!ancestorStats.isDirectory()) throw new Error("Local Task context directory is invalid.");
    } catch (error: unknown) {
      if (!isMissingPath(error)) throw error;
    }
    const parentDirectory = dirname(ancestor);
    if (parentDirectory === ancestor) return;
    ancestor = parentDirectory;
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Local Task document operation aborted", "AbortError");
}
