import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerTaskTools } from "./registerTaskTools";

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> };
type RegisteredTool = {
  name: string;
  parameters: { additionalProperties?: boolean; properties: Record<string, unknown> };
  execute: (...args: [string, never, AbortSignal | undefined, undefined, { cwd: string }]) => Promise<ToolResult>;
};

const TOOL_NAMES = ["task_start", "task_list", "task_read", "task_write", "task_append_note", "task_finish"];

let activeProjectRoot = "";

describe("registerTaskTools", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "pi-task-tools-"));
    activeProjectRoot = projectRoot;
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("registers only the thin task-file tools", () => {
    const tools = collectTools();

    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    for (const tool of tools) expect(tool.parameters.additionalProperties).toBe(false);
    expect(tools.map((tool) => tool.name)).not.toContain("task_reopen");
    expect(tools.map((tool) => tool.name)).not.toContain("task_update_brief");
  });

  it("creates, reads, writes, annotates, and finishes a task from ctx.cwd", async () => {
    const tools = collectTools();
    const start = await execute(requireTool(tools, "task_start"), {
      id: "scope01",
      title: "Simplify task package",
      goal: "Keep task operations direct.",
      acceptanceCriteria: ["Only thin tools are registered."],
      created: "2026-07-26",
    });

    expect(start.details).toMatchObject({ id: "scope01", status: "active" });
    await expect(readFile(join(projectRoot, ".my-context", "tasks", "state.json"), "utf8")).resolves.toContain(
      '"id": "scope01"',
    );

    await execute(requireTool(tools, "task_write"), {
      id: "scope01",
      document: "plan",
      content: "# Plan\n\n1. Keep it simple.\n",
    });
    await execute(requireTool(tools, "task_append_note"), {
      id: "scope01",
      content: "Repository machinery is out of scope.",
      date: "2026-07-26",
    });

    const plan = await execute(requireTool(tools, "task_read"), { id: "scope01", document: "plan" });
    expect(plan.content[0]?.text).toContain("Keep it simple.");

    const listed = await execute(requireTool(tools, "task_list"), { status: "active" });
    expect(listed.content[0]?.text).toContain("scope01");

    const finished = await execute(requireTool(tools, "task_finish"), {
      id: "scope01",
      outcome: "Simplified the task package.",
      completed: "2026-07-26",
    });
    expect(finished.details).toMatchObject({ id: "scope01", status: "completed" });
    await expect(
      readFile(
        join(
          projectRoot,
          ".my-context",
          "tasks",
          "completed",
          "2026",
          "07",
          "scope01-simplify-task-package",
          "outcome.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("Simplified the task package.");
  });

  it("preserves every parallel task_start state update", async () => {
    const tools = collectTools();
    const startTask = requireTool(tools, "task_start");

    await Promise.all([
      execute(startTask, { id: "start01", title: "First parallel start", created: "2026-07-26" }),
      execute(startTask, { id: "start02", title: "Second parallel start", created: "2026-07-26" }),
    ]);

    const listed = await execute(requireTool(tools, "task_list"), { status: "active" });
    expect((listed.details.tasks as Array<{ id: string }>).map((task) => task.id).sort()).toEqual([
      "start01",
      "start02",
    ]);
  });

  it("preserves every parallel task_finish state update", async () => {
    const tools = collectTools();
    const startTask = requireTool(tools, "task_start");
    await execute(startTask, { id: "finish01", title: "First parallel finish", created: "2026-07-26" });
    await execute(startTask, { id: "finish02", title: "Second parallel finish", created: "2026-07-26" });

    const finishTask = requireTool(tools, "task_finish");
    await Promise.all([
      execute(finishTask, { id: "finish01", outcome: "First outcome.", completed: "2026-07-26" }),
      execute(finishTask, { id: "finish02", outcome: "Second outcome.", completed: "2026-07-26" }),
    ]);

    const listed = await execute(requireTool(tools, "task_list"), { status: "completed" });
    expect((listed.details.tasks as Array<{ id: string }>).map((task) => task.id).sort()).toEqual([
      "finish01",
      "finish02",
    ]);
    await expect(
      execute(requireTool(tools, "task_read"), { id: "finish01", document: "outcome" }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: expect.stringContaining("First outcome.") }],
    });
    await expect(
      execute(requireTool(tools, "task_read"), { id: "finish02", document: "outcome" }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: expect.stringContaining("Second outcome.") }],
    });
  });

  it("rejects unsafe task IDs before they can create a task directory", async () => {
    const tools = collectTools();

    await expect(execute(requireTool(tools, "task_start"), { id: "../escape", title: "Unsafe" })).rejects.toThrow(
      "Task ID",
    );
  });
});

function collectTools(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  registerTaskTools({
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
  } as never);
  return tools;
}

function requireTool(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Expected ${name} to be registered`);
  return tool;
}

function execute(tool: RegisteredTool, params: Record<string, unknown>): Promise<ToolResult> {
  return tool.execute("tool-call", params as never, undefined, undefined, { cwd: activeProjectRoot });
}
