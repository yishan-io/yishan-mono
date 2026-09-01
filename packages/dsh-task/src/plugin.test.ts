import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import type { CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";
import { describe, expect, it, vi } from "vitest";

import type { TaskCapabilityRequest } from "./client";
import { registerTaskTools } from "./plugin";

const identity = { sessionId: "session-1", workspaceId: "workspace-1", generation: 2 };
const task = {
  id: "task-1",
  projectId: "project-1",
  title: "Build task plugin",
  description: "Description",
  status: "new",
  priority: "medium",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  completedAt: null,
  tags: ["dsh"],
  tagRefs: [],
};

type RegisteredTool = {
  name: string;
  execute: (arguments_: never, execution: ToolRunContext) => Promise<unknown>;
  output: { render: (arguments_: unknown, value: never) => Array<{ type: string; text: string }> };
};

describe("dsh task plugin", () => {
  it("registers the nine Pi-compatible Local Task tools", () => {
    const tools = register(createTransport());
    expect(tools).toHaveLength(9);
    expect(tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "task_start",
        "task_list",
        "task_search",
        "task_read",
        "task_update",
        "task_write",
        "task_append_note",
        "task_finish",
        "task_template_read",
      ]),
    );
  });

  it("renders the synthetic task brief without exposing daemon paths", async () => {
    const tools = register(createTransport({ document: "task", task }));
    const tool = requireTool(tools, "task_read");
    const result = await tool.execute({ id: "task-1" } as never, execution());
    const text = tool.output.render({}, result as never)[0]?.text;
    expect(text).toContain("# Build task plugin");
    expect(text).toContain("**Project:** project-1");
    expect(text).not.toContain("directory");
  });

  it("uses the agent default template and falls back to the first template", async () => {
    const templates = [{ id: "template-1", name: "Standard", content: "## Goal" }];
    const tools = register(createTransport({ templates, agentDefaultId: "missing" }));
    const tool = requireTool(tools, "task_template_read");
    const result = await tool.execute({} as never, execution());
    expect(tool.output.render({}, result as never)[0]?.text).toBe("Agent default template: Standard\n\n## Goal");
  });

  it("rejects executions without an agent-scoped identity", async () => {
    const tool = requireTool(register(createTransport()), "task_list");
    await expect(tool.execute({} as never, { signal: new AbortController().signal } as ToolRunContext)).rejects.toThrow(
      "agent-scoped",
    );
  });
});

function register(transport: CapabilityTransport<TaskCapabilityRequest>): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  registerTaskTools(
    { tools: { register: (tool: RegisteredTool) => tools.push(tool) } } as never,
    transport,
    () => identity,
  );
  return tools;
}

function createTransport(response: unknown = { tasks: [] }): CapabilityTransport<TaskCapabilityRequest> {
  return { requestCapability: vi.fn(async () => response) };
}

function requireTool(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`${name} was not registered`);
  return tool;
}

function execution(): ToolRunContext {
  return { signal: new AbortController().signal, agent: { id: "session-1" } } as ToolRunContext;
}
