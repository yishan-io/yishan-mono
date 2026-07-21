#!/usr/bin/env bun

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

type TargetStatus = "active" | "completed";

const repoRoot = process.cwd();
const tasksRoot = path.join(repoRoot, ".my-context", "tasks");
const statePath = path.join(tasksRoot, "state.json");
const taskStatusPattern = /^\*\*Status:\*\*\s+.+$/m;
const completedDatePattern = /^\*\*Completed:\*\*\s+(\d{4}-\d{2}-\d{2})$/m;
const createdDatePattern = /^\*\*Created:\*\*\s+(\d{4}-\d{2}-\d{2})$/m;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const state = await readStateFile();
  const taskIndex = state.tasks.findIndex((task) => task.id === args.id);
  if (taskIndex === -1) {
    throw new Error(`task not found: ${args.id}`);
  }

  const task = state.tasks[taskIndex];
  const currentFolderAbsolute = path.join(repoRoot, task.path);
  const folderName = path.basename(task.path);
  const nextRelativePath = await buildTargetPath(task, currentFolderAbsolute, folderName, args.to, args.date);
  const nextAbsolutePath = path.join(repoRoot, nextRelativePath);

  if (task.path !== nextRelativePath) {
    await mkdir(path.dirname(nextAbsolutePath), { recursive: true });
    await rename(currentFolderAbsolute, nextAbsolutePath);
  }

  const taskFilePath = path.join(nextAbsolutePath, "task.md");
  const taskFileContent = await readFile(taskFilePath, "utf8");
  const nextTaskFileContent = taskFileContent.replace(
    taskStatusPattern,
    `**Status:** ${args.to}`,
  );
  await writeFile(taskFilePath, nextTaskFileContent, "utf8");

  state.tasks[taskIndex] = {
    ...task,
    status: args.to,
    path: nextRelativePath,
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    id: args.id,
    from: task.path,
    to: nextRelativePath,
    status: args.to,
  }, null, 2));
}

function parseArgs(argv: string[]): { id: string; to: TargetStatus; date?: string } {
  const id = readFlagValue(argv, "--id");
  const to = readFlagValue(argv, "--to");
  const date = readOptionalFlagValue(argv, "--date");
  if (!id) {
    throw new Error("missing required flag: --id");
  }
  if (to !== "active" && to !== "completed") {
    throw new Error("--to must be active or completed");
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("--date must be YYYY-MM-DD");
  }
  return { id, to, date };
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) {
    return undefined;
  }
  return argv[index + 1];
}

function readOptionalFlagValue(argv: string[], flag: string): string | undefined {
  return readFlagValue(argv, flag);
}

async function readStateFile(): Promise<TaskStateFile> {
  const content = await readFile(statePath, "utf8");
  return JSON.parse(content) as TaskStateFile;
}

async function buildTargetPath(
  task: TaskRecord,
  currentFolderAbsolute: string,
  folderName: string,
  to: TargetStatus,
  explicitDate?: string,
): Promise<string> {
  if (to === "active") {
    return normalizeRelativePath(path.join(".my-context", "tasks", "active", folderName));
  }

  const taskFilePath = path.join(currentFolderAbsolute, "task.md");
  const outcomePath = path.join(currentFolderAbsolute, "outcome.md");
  const taskFileContent = await readFile(taskFilePath, "utf8");
  const outcomeContent = await safeReadFile(outcomePath);
  const datedValue = explicitDate ?? extractCompletedDate(outcomeContent) ?? extractCreatedDate(taskFileContent);
  const [year, month] = datedValue.split("-");
  return normalizeRelativePath(path.join(".my-context", "tasks", "completed", year, month, folderName));
}

function extractCompletedDate(content: string | null): string | null {
  if (!content) {
    return null;
  }
  const match = content.match(completedDatePattern);
  return match?.[1] ?? null;
}

function extractCreatedDate(content: string): string {
  const match = content.match(createdDatePattern);
  if (!match?.[1]) {
    throw new Error("task.md is missing **Created:** YYYY-MM-DD");
  }
  return match[1];
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}

await main();
