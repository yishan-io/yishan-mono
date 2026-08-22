import { access, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalTask, LocalTaskContextDetails, LocalTaskSearchResult } from "../backend/localTaskTypes";
import { type LocalTaskToolBackend, registerTaskTools } from "./registerTaskTools";

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> };
type RegisteredTool = {
  name: string;
  parameters: { additionalProperties?: boolean; properties: Record<string, unknown> };
  execute: (...args: [string, never, AbortSignal | undefined, undefined, { cwd: string }]) => Promise<ToolResult>;
};

const TOOL_NAMES = [
  "task_start",
  "task_list",
  "task_search",
  "task_read",
  "task_update",
  "task_write",
  "task_append_note",
  "task_finish",
];
let contextDirectory = "";
let projectDirectory = "";

beforeEach(async () => {
  contextDirectory = await realpath(await mkdtemp(join(tmpdir(), "pi-task-tools-")));
  projectDirectory = await realpath(await mkdtemp(join(tmpdir(), "pi-task-project-")));
  vi.stubEnv("YISHAN_PROJECT_ID", "project-a");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(contextDirectory, { recursive: true, force: true });
  await rm(projectDirectory, { recursive: true, force: true });
});

describe("registerTaskTools", () => {
  it("registers exactly eight strict daemon-backed tools with the locked schemas", () => {
    const tools = collectTools(createBackend());

    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    for (const tool of tools) expect(tool.parameters.additionalProperties).toBe(false);
    expect(properties(tools, "task_start")).not.toHaveProperty("id");
    expect(properties(tools, "task_start")).not.toHaveProperty("ticket");
    expect(properties(tools, "task_start")).not.toHaveProperty("date");
    expect(properties(tools, "task_finish")).not.toHaveProperty("date");
    expect(properties(tools, "task_append_note")).not.toHaveProperty("date");
    expect(properties(tools, "task_update").status).toMatchObject({ enum: ["active", "paused"] });
    expect(properties(tools, "task_update").description).toMatchObject({ minLength: 0, maxLength: 10_000 });
    for (const toolName of ["task_start", "task_list", "task_search", "task_update"]) {
      expect(properties(tools, toolName).tags).toMatchObject({ maxItems: 12, items: { maxLength: 64 } });
    }
    expect(properties(tools, "task_write").document).toMatchObject({ enum: ["notes", "plan", "outcome"] });
    expect(properties(tools, "task_read").id).not.toHaveProperty("pattern");
  });

  it("defers production daemon environment lookup until a tool executes", async () => {
    vi.stubEnv("YISHAN_DAEMON_WS_URL", "");
    const tools: RegisteredTool[] = [];

    expect(() =>
      registerTaskTools({
        registerTool(tool: RegisteredTool) {
          tools.push(tool);
        },
      } as never),
    ).not.toThrow();
    await expect(execute(tools, "task_list", {})).rejects.toThrow("Local Task daemon endpoint is unavailable");
  });

  it("routes every operation through the injected backend and never writes legacy state", async () => {
    const backend = createBackend();
    const tools = collectTools(backend);

    await execute(tools, "task_start", { title: "New task", goal: "Ship", acceptanceCriteria: ["Verify"] });
    await execute(tools, "task_list", { status: "active" });
    await execute(tools, "task_search", { query: "task", tags: ["tag"] });
    await execute(tools, "task_read", { id: "imported/task-id" });
    await execute(tools, "task_update", { id: "imported/task-id", status: "paused", tags: ["new"] });
    await execute(tools, "task_write", { id: "imported/task-id", document: "plan", content: "# Plan\n" });
    await execute(tools, "task_append_note", { id: "imported/task-id", content: "Note\n" });
    await execute(tools, "task_finish", { id: "imported/task-id", outcome: "Done" });

    expect(backend.create).toHaveBeenCalledWith(expect.objectContaining({ title: "New task", projectId: "project-a" }));
    expect(backend.list).toHaveBeenCalledWith({ projectId: "project-a", status: "active" });
    expect(backend.search).toHaveBeenCalledWith("task", { projectId: "project-a", tags: ["tag"] });
    expect(backend.getContextDetails).toHaveBeenCalled();
    expect(backend.update).toHaveBeenCalledWith("imported/task-id", { status: "completed" });
    await expect(readFile(join(contextDirectory, "plan.md"), "utf8")).resolves.toBe("# Plan\n");
    await expect(readFile(join(contextDirectory, "notes.md"), "utf8")).resolves.toBe("Note\n");
    await expect(readFile(join(contextDirectory, "outcome.md"), "utf8")).resolves.toBe("Done");
    await expect(access(join(projectDirectory, ".my-context", "tasks", "state.json"))).rejects.toThrow();
    await expect(access(join(projectDirectory, ".my-context", "tasks", "active"))).rejects.toThrow();
    await expect(access(join(projectDirectory, ".my-context", "tasks", "completed"))).rejects.toThrow();
  });

  it("enforces project scope before document routing", async () => {
    const backend = createBackend({ getResult: task({ projectId: "other-project" }) });
    const tools = collectTools(backend);

    await expect(execute(tools, "task_write", { id: "other", document: "plan", content: "blocked" })).rejects.toThrow(
      "configured project scope",
    );
    expect(backend.getContextDetails).not.toHaveBeenCalled();
  });

  it("forwards abort signals and truncates tool text output", async () => {
    const controller = new AbortController();
    const backend = createBackend({ getResult: task({ title: "x".repeat(100_000) }) });
    const tools = collectTools(backend);
    const read = requireTool(tools, "task_read");

    const response = await read.execute("call", { id: "imported/task-id" } as never, controller.signal, undefined, {
      cwd: "",
    });
    expect(backend.get).toHaveBeenCalledWith("imported/task-id", { signal: controller.signal });
    expect(response.details.truncated).toBe(true);
  });
});

function collectTools(backend: LocalTaskToolBackend): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  registerTaskTools(
    {
      registerTool(tool: RegisteredTool) {
        tools.push(tool);
      },
    } as never,
    backend,
  );
  return tools;
}
function properties(tools: RegisteredTool[], name: string): Record<string, unknown> {
  return requireTool(tools, name).parameters.properties;
}
function requireTool(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Expected ${name} to be registered`);
  return tool;
}
function execute(tools: RegisteredTool[], name: string, params: Record<string, unknown>): Promise<ToolResult> {
  return requireTool(tools, name).execute("call", params as never, undefined, undefined, { cwd: projectDirectory });
}
function createBackend(overrides: { getResult?: LocalTask } = {}): LocalTaskToolBackend {
  const localTask = task();
  const details: LocalTaskContextDetails = {
    directory: contextDirectory,
    planPath: join(contextDirectory, "plan.md"),
    notesPath: join(contextDirectory, "notes.md"),
    outcomePath: join(contextDirectory, "outcome.md"),
  };
  return {
    create: vi.fn().mockResolvedValue(localTask),
    get: vi.fn().mockResolvedValue(overrides.getResult ?? localTask),
    list: vi.fn().mockResolvedValue([localTask]),
    search: vi.fn().mockResolvedValue([{ ...localTask, rank: 1 } satisfies LocalTaskSearchResult]),
    update: vi.fn().mockResolvedValue({ ...localTask, status: "completed" }),
    getContextDetails: vi.fn().mockResolvedValue(details),
  } as LocalTaskToolBackend;
}
function task(overrides: Partial<LocalTask> = {}): LocalTask {
  return {
    id: "imported/task-id",
    projectId: "project-a",
    title: "Task",
    description: "Description",
    status: "active",
    priority: "medium",
    createdAt: "2026-08-23T00:00:00Z",
    updatedAt: "2026-08-23T00:00:00Z",
    completedAt: null,
    tags: ["tag"],
    ...overrides,
  };
}
