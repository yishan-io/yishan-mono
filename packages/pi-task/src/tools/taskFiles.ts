import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

type TaskStatus = "active" | "completed";
type TaskDocument = "task" | "notes" | "plan" | "outcome";

type TaskRecord = { id: string; title: string; status: TaskStatus; created: string; path: string };
type TaskState = { tasks: TaskRecord[] };
type StartTaskInput = {
  title: string;
  id?: string;
  ticket?: string;
  goal?: string;
  acceptanceCriteria?: string[];
  created?: string;
};

const TASKS_DIRECTORY = ".my-context/tasks";
const TASK_DOCUMENTS = new Set<TaskDocument>(["task", "notes", "plan", "outcome"]);
const TASK_ID_PATTERN = /^[A-Za-z0-9-]{1,60}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Creates an active task folder, task brief, and state entry. */
export async function startTask(projectRoot: string, input: StartTaskInput): Promise<TaskRecord> {
  const statePath = getTaskStatePath(projectRoot);
  return withFileMutationQueue(statePath, async () => {
    const state = await readTaskState(projectRoot);
    const id = input.id ?? createTaskId(state.tasks);
    assertTaskId(id);
    if (state.tasks.some((task) => task.id.toLowerCase() === id.toLowerCase())) {
      throw new Error(`Task ID already exists: ${id}`);
    }

    const created = input.created ?? getTodayDate();
    assertDate(created);
    const title = requireText(input.title, "Title");
    const folderName = `${id}-${createTaskSlug(title)}`;
    const taskPath = normalizePath(join(TASKS_DIRECTORY, "active", folderName));
    const directory = resolveProjectPath(projectRoot, taskPath);
    const task: TaskRecord = { id, title, status: "active", created, path: taskPath };

    await mkdir(directory, { recursive: true });
    const taskBriefPath = join(directory, "task.md");
    await withFileMutationQueue(taskBriefPath, async () => {
      await writeFile(taskBriefPath, buildTaskMarkdown(task, input), "utf8");
    });
    await writeTaskState(projectRoot, { tasks: [...state.tasks, task] });
    return task;
  });
}

/** Lists task records, optionally filtered by lifecycle status. */
export async function listTasks(projectRoot: string, status?: TaskStatus): Promise<TaskRecord[]> {
  const state = await readTaskState(projectRoot);
  return status ? state.tasks.filter((task) => task.status === status) : state.tasks;
}

/** Reads a named task document. */
export async function readTaskDocument(projectRoot: string, id: string, document: TaskDocument): Promise<string> {
  const filePath = await getTaskDocumentPath(projectRoot, id, document);
  return readFile(filePath, "utf8");
}

/** Replaces a named task document with the supplied content. */
export async function writeTaskDocument(
  projectRoot: string,
  id: string,
  document: TaskDocument,
  content: string,
): Promise<void> {
  await withFileMutationQueue(getTaskStatePath(projectRoot), async () => {
    const filePath = await ensureTaskDocumentPath(projectRoot, id, document);
    await withFileMutationQueue(filePath, async () => {
      await writeFile(filePath, content, "utf8");
    });
  });
}

/** Appends a dated entry to a task's notes document. */
export async function appendTaskNote(projectRoot: string, id: string, content: string, date?: string): Promise<void> {
  const note = requireText(content, "Note");
  const entryDate = date ?? getTodayDate();
  assertDate(entryDate);
  await withFileMutationQueue(getTaskStatePath(projectRoot), async () => {
    const filePath = await ensureTaskDocumentPath(projectRoot, id, "notes");
    await withFileMutationQueue(filePath, async () => {
      const currentContent = await readOptionalFile(filePath);
      const prefix = currentContent.length === 0 ? "" : currentContent.endsWith("\n") ? "\n" : "\n\n";
      await appendFile(filePath, `${prefix}## ${entryDate}\n\n${note}\n`, "utf8");
    });
  });
}

/** Writes an outcome and moves an active task into its completed folder. */
export async function finishTask(
  projectRoot: string,
  id: string,
  outcome: string,
  completed?: string,
): Promise<TaskRecord> {
  const statePath = getTaskStatePath(projectRoot);
  return withFileMutationQueue(statePath, async () => {
    const state = await readTaskState(projectRoot);
    const taskIndex = state.tasks.findIndex((task) => task.id === id);
    if (taskIndex === -1) throw new Error(`Task not found: ${id}`);
    const task = state.tasks[taskIndex];
    if (!task) throw new Error(`Task not found: ${id}`);
    if (task.status !== "active") throw new Error(`Task is not active: ${id}`);

    const completedDate = completed ?? getTodayDate();
    assertDate(completedDate);
    const sourceDirectory = resolveProjectPath(projectRoot, task.path);
    const outcomePath = join(sourceDirectory, "outcome.md");
    await withFileMutationQueue(outcomePath, async () => {
      await writeFile(outcomePath, buildOutcomeMarkdown(task.title, completedDate, outcome), "utf8");
    });
    const taskBriefPath = join(sourceDirectory, "task.md");
    await withFileMutationQueue(taskBriefPath, async () => {
      const currentTaskBrief = await readFile(taskBriefPath, "utf8");
      await writeFile(taskBriefPath, updateTaskStatus(currentTaskBrief), "utf8");
    });

    const [year, month] = completedDate.split("-");
    if (!year || !month) throw new Error("Date must use YYYY-MM-DD.");
    const nextPath = normalizePath(join(TASKS_DIRECTORY, "completed", year, month, basename(task.path)));
    const destinationDirectory = resolveProjectPath(projectRoot, nextPath);
    await mkdir(resolve(destinationDirectory, ".."), { recursive: true });
    await rename(sourceDirectory, destinationDirectory);

    const nextTask = { ...task, status: "completed" as const, path: nextPath };
    state.tasks[taskIndex] = nextTask;
    await writeTaskState(projectRoot, state);
    return nextTask;
  });
}

/**
 * Resolves a task document path and ensures its parent directory exists.
 * Re-reads task state after creating the directory to detect moves by a
 * concurrent finishTask (e.g., from a sub-agent session), corrects the
 * path, and removes the stale empty directory when possible.
 */
async function ensureTaskDocumentPath(projectRoot: string, id: string, document: TaskDocument): Promise<string> {
  const filePath = await getTaskDocumentPath(projectRoot, id, document);
  await mkdir(resolve(filePath, ".."), { recursive: true });
  // Re-read state to detect if finishTask moved the task concurrently
  const currentPath = await getTaskDocumentPath(projectRoot, id, document);
  if (currentPath !== filePath) {
    // Task was moved — clean up the stale empty directory mkdir just created.
    // Use force (suppresses ENOENT) without recursive: only removes empty dirs.
    // If the dir is non-empty a concurrent write beat us; leave it in place.
    try {
      await rm(resolve(filePath, ".."), { force: true });
    } catch {
      // Directory not empty or permission error — skip cleanup
    }
  }
  return currentPath;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Validates a task ID accepted by the simple task-file operations. */
export function assertTaskId(id: string): void {
  if (!TASK_ID_PATTERN.test(id)) throw new Error("Task ID must contain only letters, digits, and hyphens.");
}

/** Validates a task document name. */
export function assertTaskDocument(document: string): asserts document is TaskDocument {
  if (!TASK_DOCUMENTS.has(document as TaskDocument)) throw new Error(`Unknown task document: ${document}`);
}

async function readTaskState(projectRoot: string): Promise<TaskState> {
  const statePath = getTaskStatePath(projectRoot);
  const content = await readOptionalFile(statePath);
  if (content.length === 0) return { tasks: [] };
  const value: unknown = JSON.parse(content);
  if (!isTaskState(value)) throw new Error("Task state must contain a tasks array.");
  return value;
}

async function writeTaskState(projectRoot: string, state: TaskState): Promise<void> {
  const statePath = getTaskStatePath(projectRoot);
  await mkdir(resolve(statePath, ".."), { recursive: true });
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, statePath);
}

function getTaskStatePath(projectRoot: string): string {
  return resolveProjectPath(projectRoot, join(TASKS_DIRECTORY, "state.json"));
}

async function getTaskDocumentPath(projectRoot: string, id: string, document: TaskDocument): Promise<string> {
  assertTaskId(id);
  assertTaskDocument(document);
  const state = await readTaskState(projectRoot);
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  return join(resolveProjectPath(projectRoot, task.path), `${document}.md`);
}

function isTaskState(value: unknown): value is TaskState {
  return typeof value === "object" && value !== null && "tasks" in value && Array.isArray(value.tasks);
}

// ---------------------------------------------------------------------------
// Markdown builders
// ---------------------------------------------------------------------------

function buildTaskMarkdown(task: TaskRecord, input: StartTaskInput): string {
  const goal = input.goal?.trim() || `Complete the work described by "${task.title}".`;
  const criteria = input.acceptanceCriteria?.filter((criterion) => criterion.trim().length > 0) ?? [];
  const acceptance = criteria.length > 0 ? criteria : ["The requested work is implemented or clearly planned."];
  return [
    `# ${task.title}`,
    "",
    `**ID:** ${task.id}`,
    `**Ticket:** ${input.ticket?.trim() || "none"}`,
    `**Created:** ${task.created}`,
    "**Status:** active",
    "",
    "## Goal",
    "",
    goal,
    "",
    "## Acceptance Criteria",
    "",
    ...acceptance.map((criterion) => `- ${criterion.trim()}`),
    "",
  ].join("\n");
}

function buildOutcomeMarkdown(title: string, completed: string, outcome: string): string {
  return `# Outcome: ${title}\n\n**Completed:** ${completed}\n\n${requireText(outcome, "Outcome")}\n`;
}

function updateTaskStatus(content: string): string {
  return /^\*\*Status:\*\*\s+.+$/m.test(content)
    ? content.replace(/^\*\*Status:\*\*\s+.+$/m, "**Status:** completed")
    : `${content.trimEnd()}\n\n**Status:** completed\n`;
}

// ---------------------------------------------------------------------------
// ID and slug generation
// ---------------------------------------------------------------------------

function createTaskId(tasks: TaskRecord[]): string {
  let id = "";
  do id = `${randomLetters(3)}${randomDigits(2)}`;
  while (tasks.some((task) => task.id === id));
  return id;
}

function randomLetters(length: number): string {
  return Array.from({ length }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

function createTaskSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (slug.length === 0) throw new Error("Title must contain at least one letter or digit.");
  return slug;
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

function resolveProjectPath(projectRoot: string, value: string): string {
  const root = resolve(projectRoot);
  const target = resolve(root, value);
  const relativePath = relative(root, target);
  if (
    isAbsolute(value) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error("Task path must stay inside the project root.");
  }
  return target;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function requireText(value: string, name: string): string {
  const text = value.trim();
  if (text.length === 0) throw new Error(`${name} must not be empty.`);
  return text;
}

function assertDate(value: string): void {
  if (!DATE_PATTERN.test(value)) throw new Error("Date must use YYYY-MM-DD.");
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isEnoent(error)) return "";
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT"
  );
}
