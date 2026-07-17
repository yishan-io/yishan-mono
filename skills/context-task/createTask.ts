#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type TaskRecord = {
  id: string;
  title: string;
  status: string;
  created: string;
  path: string;
};

type TaskStateFile = {
  tasks: TaskRecord[];
};

type CreateTaskArgs = {
  title: string;
  id?: string;
  ticket: string;
  goal?: string;
  acceptance: string[];
  created: string;
  dryRun: boolean;
};

const repoRoot = process.cwd();
const tasksRoot = path.join(repoRoot, ".my-context", "tasks");
const activeRoot = path.join(tasksRoot, "active");
const statePath = path.join(tasksRoot, "state.json");
const localIdAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const state = await readStateFile();
  const id = args.id ?? createLocalId(state.tasks);
  const slug = slugify(args.title);
  const relativePath = normalizeRelativePath(path.join(".my-context", "tasks", "active", `${id}-${slug}`));
  const absolutePath = path.join(repoRoot, relativePath);

  ensureUniqueTaskId(state.tasks, id);
  await ensureTaskPathIsAvailable(state.tasks, absolutePath, relativePath);

  const taskRecord: TaskRecord = {
    id,
    title: args.title,
    status: "active",
    created: args.created,
    path: relativePath,
  };
  const taskFileContent = buildTaskMarkdown({
    title: args.title,
    id,
    ticket: args.ticket,
    created: args.created,
    goal: args.goal,
    acceptance: args.acceptance,
  });

  if (!args.dryRun) {
    await mkdir(absolutePath, { recursive: true });
    await writeFile(path.join(absolutePath, "task.md"), taskFileContent, "utf8");
    const nextState: TaskStateFile = { tasks: [...state.tasks, taskRecord] };
    await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        id,
        title: args.title,
        path: relativePath,
        created: args.created,
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv: string[]): CreateTaskArgs {
  const title = readFlagValue(argv, "--title");
  const id = readFlagValue(argv, "--id");
  const ticket = readFlagValue(argv, "--ticket") ?? "none";
  const goal = readFlagValue(argv, "--goal");
  const acceptance = readRepeatedFlagValues(argv, "--acceptance");
  const created = readFlagValue(argv, "--created") ?? getTodayDate();
  const dryRun = argv.includes("--dry-run");

  if (!title) {
    throw new Error("missing required flag: --title");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(created)) {
    throw new Error("--created must be YYYY-MM-DD");
  }

  return {
    title,
    id,
    ticket,
    goal,
    acceptance,
    created,
    dryRun,
  };
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) {
    return undefined;
  }
  return argv[index + 1];
}

function readRepeatedFlagValues(argv: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && index + 1 < argv.length) {
      values.push(argv[index + 1]);
    }
  }
  return values;
}

async function readStateFile(): Promise<TaskStateFile> {
  try {
    const content = await readFile(statePath, "utf8");
    return JSON.parse(content) as TaskStateFile;
  } catch (error) {
    if (isNotFoundError(error)) {
      return { tasks: [] };
    }
    throw error;
  }
}

function ensureUniqueTaskId(tasks: TaskRecord[], id: string): void {
  if (tasks.some((task) => task.id === id)) {
    throw new Error(`task id already exists: ${id}`);
  }
}

async function ensureTaskPathIsAvailable(
  tasks: TaskRecord[],
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  if (tasks.some((task) => task.path === relativePath)) {
    throw new Error(`task path already exists in state: ${relativePath}`);
  }
  try {
    await readFile(path.join(absolutePath, "task.md"), "utf8");
    throw new Error(`task path already exists on disk: ${relativePath}`);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }
}

function buildTaskMarkdown(input: {
  title: string;
  id: string;
  ticket: string;
  created: string;
  goal?: string;
  acceptance: string[];
}): string {
  const goal = input.goal ?? buildDefaultGoal(input.title);
  const acceptance = input.acceptance.length > 0 ? input.acceptance : buildDefaultAcceptance(input.title);
  const acceptanceLines = acceptance.map((item) => `- ${item}`).join("\n");
  return `# ${input.title}

**ID:** ${input.id}
**Ticket:** ${input.ticket}
**Created:** ${input.created}
**Status:** active

## Goal

${goal}

## Acceptance Criteria

${acceptanceLines}
`;
}

function buildDefaultGoal(title: string): string {
  return `Complete the work described by \"${title}\" and refine the task record as the implementation approach becomes more concrete.`;
}

function buildDefaultAcceptance(title: string): string[] {
  return [
    `The requested work for \"${title}\" is implemented or clearly planned with the task record kept up to date.`,
    "Any important research, scope changes, or follow-up decisions are captured in the task files.",
  ];
}

function createLocalId(tasks: TaskRecord[]): string {
  let candidate = "";
  do {
    candidate = `${randomLetters(3)}${randomDigits(2)}`;
  } while (tasks.some((task) => task.id === candidate));
  return candidate;
}

function randomLetters(length: number): string {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += localIdAlphabet[Math.floor(Math.random() * 26)];
  }
  return output;
}

function randomDigits(length: number): string {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += String(Math.floor(Math.random() * 10));
  }
  return output;
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!slug) {
    throw new Error("title must contain at least one alphanumeric character");
  }
  return slug;
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

await main();
