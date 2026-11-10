import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalTaskRPCError } from "../backend/localTaskRpcClient";
import type {
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskSearchResult,
  LocalTaskTemplatesResult,
  LocalTaskWorkspaceLink,
} from "../backend/localTaskTypes";
import { createPiTaskReadExtension } from "../index";
import { type LocalTaskToolBackend, registerTaskTools } from "./registerTaskTools";

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> };
type RegisteredTool = {
  name: string;
  parameters: { additionalProperties?: boolean; properties: Record<string, unknown> };
  execute: (...args: [string, never, AbortSignal | undefined, undefined, { cwd: string }]) => Promise<ToolResult>;
};

const TOOL_NAMES = [
  "task_start",
  "task_link_workspace",
  "task_list",
  "task_search",
  "task_read",
  "task_update",
  "task_write",
  "task_append_note",
  "task_finish",
  "task_template_read",
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
  it("registers only the existing task_read definition through the read-only entry point", async () => {
    const backend = createBackend();
    const registered: RegisteredTool[] = [];
    createPiTaskReadExtension({ registerTool: (tool: RegisteredTool) => registered.push(tool) } as never, backend);
    expect(registered.map((tool) => tool.name)).toEqual(["task_read"]);
    const fullRead = requireTool(collectTools(backend), "task_read");
    const readTool = requireTool(registered, "task_read");
    expect(readTool.parameters).toEqual(fullRead.parameters);
    for (const document of ["task", "plan", "notes", "outcome"] as const) {
      if (document !== "task") await writeFile(join(contextDirectory, `${document}.md`), `${document} content`);
      const params = { id: "task-a", document } as never;
      expect(await readTool.execute("read", params, undefined, undefined, { cwd: projectDirectory })).toEqual(
        await fullRead.execute("read", params, undefined, undefined, { cwd: projectDirectory }),
      );
    }
  });

  it("registers exactly ten strict daemon-backed tools with the locked schemas", () => {
    const tools = collectTools(createBackend());

    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    for (const tool of tools) expect(tool.parameters.additionalProperties).toBe(false);
    expect(properties(tools, "task_link_workspace")).toEqual({
      id: { type: "string", minLength: 1 },
      workspaceId: { type: "string", minLength: 1 },
    });
    expect(requireTool(tools, "task_link_workspace").parameters).toMatchObject({ required: ["id", "workspaceId"] });
    expect(properties(tools, "task_start")).not.toHaveProperty("id");
    expect(properties(tools, "task_start")).not.toHaveProperty("ticket");
    expect(properties(tools, "task_start")).not.toHaveProperty("date");
    expect(properties(tools, "task_start").workspaceId).toMatchObject({ minLength: 1 });
    expect(properties(tools, "task_start").context).toMatchObject({ minLength: 1, maxLength: 10_000 });
    expect(properties(tools, "task_finish")).not.toHaveProperty("date");
    expect(properties(tools, "task_append_note")).not.toHaveProperty("date");
    expect(properties(tools, "task_update").status).toMatchObject({ enum: ["new", "progressing", "cancelled"] });
    for (const toolName of ["task_list", "task_search"]) {
      expect(properties(tools, toolName).status).toHaveProperty("anyOf");
    }
    expect(properties(tools, "task_update").description).toMatchObject({ minLength: 0, maxLength: 10_000 });
    for (const toolName of ["task_start", "task_list", "task_search", "task_update"]) {
      expect(properties(tools, toolName).tags).toMatchObject({ maxItems: 12, items: { maxLength: 64 } });
    }
    expect(properties(tools, "task_write").document).toMatchObject({ enum: ["notes", "plan", "outcome"] });
    expect(properties(tools, "task_read").id).not.toHaveProperty("pattern");
  });

  it("accepts legacy scalar and multi-status filters in list and search schemas", () => {
    const tools = collectTools(createBackend());

    for (const toolName of ["task_list", "task_search"]) {
      expect(properties(tools, toolName).status).toEqual({
        anyOf: [
          { type: "string", enum: ["new", "progressing", "done", "cancelled"] },
          {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", enum: ["new", "progressing", "done", "cancelled"] },
          },
        ],
      });
    }
  });

  it("returns the agent default task template content", async () => {
    const backend = createBackend();
    const tools = collectTools(backend);

    const response = await execute(tools, "task_template_read", {});

    expect(response.content).toEqual([
      { type: "text", text: "Agent default template: Agent default\n\n## Goal\n\n## Context" },
    ]);
    expect(response.details).toMatchObject({
      agentDefaultId: "agent-default",
      template: { id: "agent-default", name: "Agent default", content: "## Goal\n\n## Context" },
    });
    expect(backend.getTemplates).toHaveBeenCalledWith({ signal: undefined });
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

    await execute(tools, "task_start", {
      title: "New task",
      goal: "Ship",
      context: "Customer onboarding is blocked.",
      acceptanceCriteria: ["Verify"],
      workspaceId: "workspace-1",
    });
    await execute(tools, "task_list", { status: ["new", "progressing"] });
    await execute(tools, "task_search", { query: "task", tags: ["tag"] });
    await execute(tools, "task_read", { id: "imported/task-id" });
    await execute(tools, "task_update", { id: "imported/task-id", status: "cancelled", tags: ["new"] });
    await execute(tools, "task_write", { id: "imported/task-id", document: "plan", content: "# Plan\n" });
    await execute(tools, "task_append_note", { id: "imported/task-id", content: "Note\n" });
    await execute(tools, "task_finish", { id: "imported/task-id", outcome: "Done" });
    await execute(tools, "task_template_read", {});

    expect(backend.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New task",
        projectId: "project-a",
        description:
          "## Goal\n\nShip\n\n## Context\n\nCustomer onboarding is blocked.\n\n## Acceptance Criteria\n\n- Verify",
      }),
    );
    expect(backend.linkWorkspace).toHaveBeenCalledWith("imported/task-id", "workspace-1");
    expect(backend.list).toHaveBeenCalledWith({ projectId: "project-a", status: ["new", "progressing"] });
    expect(backend.search).toHaveBeenCalledWith("task", { projectId: "project-a", tags: ["tag"] });
    expect(backend.getContextDetails).toHaveBeenCalled();
    expect(backend.update).toHaveBeenCalledWith("imported/task-id", { status: "done" });
    await expect(readFile(join(contextDirectory, "plan.md"), "utf8")).resolves.toBe("# Plan\n");
    await expect(readFile(join(contextDirectory, "notes.md"), "utf8")).resolves.toBe("Note\n");
    await expect(readFile(join(contextDirectory, "outcome.md"), "utf8")).resolves.toBe("Done");
    await expect(access(join(projectDirectory, ".my-context", "tasks", "state.json"))).rejects.toThrow();
    await expect(access(join(projectDirectory, ".my-context", "tasks", "active"))).rejects.toThrow();
    await expect(access(join(projectDirectory, ".my-context", "tasks", "completed"))).rejects.toThrow();
  });

  it.each(["imported/task-id", "TASK-438"])("links %s with canonical identity and cancellation only", async (id) => {
    const canonicalTask = task({ id: "imported/task-id", key: "TASK-438" });
    const backend = createBackend({ getResult: canonicalTask, searchResult: canonicalTask });
    if (id === "TASK-438") backend.get = vi.fn().mockRejectedValue(new LocalTaskRPCError(-32004, "not found"));
    const link: LocalTaskWorkspaceLink = {
      id: "link-1",
      localTaskId: canonicalTask.id,
      workspaceId: "workspace-1",
      status: "new",
      linkedAt: "2026-11-03",
      unlinkedAt: null,
    };
    vi.mocked(backend.linkWorkspace).mockResolvedValue(link);
    const signal = new AbortController().signal;

    const response = await requireTool(collectTools(backend), "task_link_workspace").execute(
      "call",
      { id, workspaceId: "workspace-1" } as never,
      signal,
      undefined,
      { cwd: projectDirectory },
    );

    expect(backend.get).toHaveBeenCalledWith(id, { signal });
    if (id === "TASK-438") expect(backend.search).toHaveBeenCalledWith(id, { projectId: "project-a" }, { signal });
    else expect(backend.search).not.toHaveBeenCalled();
    expect(backend.linkWorkspace).toHaveBeenCalledExactlyOnceWith(canonicalTask.id, "workspace-1", { signal });
    expect(response.details).toMatchObject({ id: canonicalTask.id, workspaceId: "workspace-1", link });
    expect(response.content[0]?.text).toContain(canonicalTask.id);
    expect(backend.create).not.toHaveBeenCalled();
    expect(backend.update).not.toHaveBeenCalled();
    expect(backend.getContextDetails).not.toHaveBeenCalled();
    await expect(access(join(contextDirectory, "notes.md"))).rejects.toThrow();
  });

  it.each([
    ["project-a", "other-project"],
    ["project-a", null],
    ["", "project-a"],
  ])("rejects linking outside scope %s to %s", async (scope, projectId) => {
    vi.stubEnv("YISHAN_PROJECT_ID", scope);
    const backend = createBackend({ getResult: task({ projectId }) });
    await expect(
      execute(collectTools(backend), "task_link_workspace", {
        id: "imported/task-id",
        workspaceId: "workspace-1",
      }),
    ).rejects.toThrow("configured project scope");
    expect(backend.linkWorkspace).not.toHaveBeenCalled();
    expect(backend.search).not.toHaveBeenCalled();
  });

  it("resolves only an exact in-scope key before linking", async () => {
    const backend = createBackend({ searchResult: task({ key: "TASK-438-extra" }) });
    backend.get = vi.fn().mockRejectedValue(new LocalTaskRPCError(-32004, "not found"));
    const tools = collectTools(backend);
    await expect(execute(tools, "task_link_workspace", { id: "TASK-438", workspaceId: "ws" })).rejects.toThrow(
      "not found",
    );
    vi.mocked(backend.search).mockResolvedValue([{ ...task({ key: "TASK-438", projectId: "other" }), rank: 1 }]);
    await expect(execute(tools, "task_link_workspace", { id: "TASK-438", workspaceId: "ws" })).rejects.toThrow(
      "not found",
    );
    expect(backend.linkWorkspace).not.toHaveBeenCalled();
  });

  it("keeps a global task and its context on link failure and retries only the same association", async () => {
    vi.stubEnv("YISHAN_PROJECT_ID", "");
    const backend = createBackend({ getResult: task({ projectId: null }) });
    const failure = new Error("link unavailable");
    const link: LocalTaskWorkspaceLink = {
      id: "link-1",
      localTaskId: "imported/task-id",
      workspaceId: "ws",
      status: "new",
      linkedAt: "2026-11-03",
      unlinkedAt: null,
    };
    vi.mocked(backend.linkWorkspace).mockRejectedValueOnce(failure).mockResolvedValue(link);
    const tools = collectTools(backend);
    await expect(execute(tools, "task_link_workspace", { id: "imported/task-id", workspaceId: "ws" })).rejects.toBe(
      failure,
    );
    expect(backend.linkWorkspace).toHaveBeenCalledTimes(1);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        execute(tools, "task_link_workspace", { id: "imported/task-id", workspaceId: "ws" }),
      ).resolves.toMatchObject({
        details: { id: "imported/task-id", workspaceId: "ws", link },
      });
    }
    expect(backend.linkWorkspace).toHaveBeenCalledTimes(3);
    expect(backend.linkWorkspace).toHaveBeenLastCalledWith("imported/task-id", "ws");
    expect(backend.create).not.toHaveBeenCalled();
    expect(backend.update).not.toHaveBeenCalled();
    expect(backend.getContextDetails).not.toHaveBeenCalled();
  });

  it.each([
    ["project-a", "project-a", true],
    ["", "project-a", false],
    ["project-a", "project-b", false],
  ])("reads the original controller task from target scope %s → %s: %s", async (source, target, canRead) => {
    vi.stubEnv("YISHAN_PROJECT_ID", source);
    const backend = createBackend();
    const controller = collectTools(backend);
    const originalTask = task({ projectId: source || null, description: "Original requirements and context" });
    vi.mocked(backend.create).mockResolvedValue(originalTask);
    vi.mocked(backend.get).mockResolvedValue(originalTask);
    await execute(controller, "task_start", { title: "Task", description: originalTask.description });
    await execute(controller, "task_write", { id: originalTask.id, document: "notes", content: "Original notes" });
    await execute(controller, "task_write", { id: originalTask.id, document: "plan", content: "Frozen plan" });
    vi.mocked(backend.getContextDetails).mockClear();

    // The launched Pi inherits the workspace project, not the controller's task scope.
    vi.stubEnv("YISHAN_PROJECT_ID", target);
    const targetTools = collectTools(backend);
    if (canRead) {
      const brief = await execute(targetTools, "task_read", { id: originalTask.id });
      expect(brief.content[0]?.text).toContain(originalTask.description);
      expect(brief.content[0]?.text).toContain(`**Project:** ${target}`);
      for (const [document, content] of [
        ["notes", "Original notes"],
        ["plan", "Frozen plan"],
      ]) {
        const response = await execute(targetTools, "task_read", { id: originalTask.id, document });
        expect(response.content[0]?.text).toBe(content);
      }
    } else {
      for (const document of ["task", "notes", "plan"]) {
        await expect(execute(targetTools, "task_read", { id: originalTask.id, document })).rejects.toThrow(
          "configured project scope",
        );
      }
      expect(backend.getContextDetails).not.toHaveBeenCalled();
    }
    expect(backend.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ description: originalTask.description, ...(source ? { projectId: source } : {}) }),
    );
    if (!source) expect(vi.mocked(backend.create).mock.calls[0]?.[0]).not.toHaveProperty("projectId");
    expect(backend.linkWorkspace).not.toHaveBeenCalled();
    expect(backend.update).not.toHaveBeenCalled();
  });

  it("reads task metadata by stable key and returns its canonical task ID", async () => {
    const backend = createBackend({ searchResult: task({ id: "canonical-id", key: "TASK-438" }) });
    backend.get = vi.fn().mockRejectedValue(new LocalTaskRPCError(-32004, "local task not found"));
    const tools = collectTools(backend);

    const response = await execute(tools, "task_read", { id: "TASK-438" });

    expect(response.details).toMatchObject({ id: "TASK-438", document: "task" });
    expect(backend.get).toHaveBeenCalledWith("TASK-438");
    expect(backend.search).toHaveBeenCalledWith("TASK-438", { projectId: "project-a" });
    expect(response.content[0]?.text).toContain("**ID:** canonical-id");
  });

  it("uses a stable key's canonical ID for task_update", async () => {
    const canonicalTask = task({ id: "canonical-id", key: "TASK-438" });
    const backend = createBackend({ searchResult: canonicalTask });
    backend.get = vi.fn().mockRejectedValue(new LocalTaskRPCError(-32004, "local task not found"));

    await execute(collectTools(backend), "task_update", { id: "TASK-438", title: "Updated" });

    expect(backend.update).toHaveBeenCalledWith("canonical-id", { title: "Updated" });
    expect(backend.get).toHaveBeenCalledTimes(1);
    expect(backend.search).toHaveBeenCalledTimes(1);
  });

  it("uses a stable key's canonical ID for task_finish daemon calls", async () => {
    const canonicalTask = task({ id: "canonical-id", key: "TASK-438" });
    const backend = createBackend({ searchResult: canonicalTask });
    backend.get = vi.fn().mockRejectedValue(new LocalTaskRPCError(-32004, "local task not found"));

    await execute(collectTools(backend), "task_finish", { id: "TASK-438", outcome: "Done" });

    expect(backend.getContextDetails).toHaveBeenCalledWith("canonical-id");
    expect(backend.update).toHaveBeenCalledWith("canonical-id", { status: "done" });
    expect(backend.get).toHaveBeenCalledTimes(1);
    expect(backend.search).toHaveBeenCalledTimes(1);
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
function createBackend(overrides: { getResult?: LocalTask; searchResult?: LocalTask } = {}): LocalTaskToolBackend {
  const localTask = task();
  const details: LocalTaskContextDetails = { directory: contextDirectory, files: [] };
  return {
    create: vi.fn().mockResolvedValue(localTask),
    get: vi.fn().mockResolvedValue(overrides.getResult ?? localTask),
    list: vi.fn().mockResolvedValue([localTask]),
    search: vi
      .fn()
      .mockResolvedValue([{ ...(overrides.searchResult ?? localTask), rank: 1 } satisfies LocalTaskSearchResult]),
    update: vi.fn().mockResolvedValue({ ...localTask, status: "done" }),
    linkWorkspace: vi.fn(),
    getContextDetails: vi.fn().mockResolvedValue(details),
    getTemplates: vi.fn().mockResolvedValue(templates()),
  } as LocalTaskToolBackend;
}
function templates(): LocalTaskTemplatesResult {
  return {
    templates: [
      { id: "personal", name: "Personal", content: "## Personal" },
      { id: "agent-default", name: "Agent default", content: "## Goal\n\n## Context" },
    ],
    agentDefaultId: "agent-default",
  };
}
function task(overrides: Partial<LocalTask> = {}): LocalTask {
  return {
    id: "imported/task-id",
    projectId: "project-a",
    title: "Task",
    description: "Description",
    status: "progressing",
    priority: "medium",
    createdAt: "2026-08-23T00:00:00Z",
    updatedAt: "2026-08-23T00:00:00Z",
    completedAt: null,
    hasActiveWorkspace: false,
    tags: ["tag"],
    tagRefs: [],
    ...overrides,
  };
}
