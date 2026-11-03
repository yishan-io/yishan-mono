import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { registerWorkspaceTools } from "./registerWorkspaceTools";

describe("registerWorkspaceTools", () => {
  it("registers workspace lifecycle tools", () => {
    const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
    const pi = {
      registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
        tools.push(tool);
      },
    };

    registerWorkspaceTools(
      pi as never,
      {
        list: vi.fn(),
        find: vi.fn(),
        create: vi.fn(),
        close: vi.fn(),
      } as never,
    );

    expect(tools.map((tool) => tool.name)).toEqual([
      "workspace_list",
      "workspace_find",
      "workspace_create",
      "workspace_close",
    ]);
  });

  it("does not expose taskRunAgentKind because new-workspace task runs always use Pi", () => {
    const tools: Array<{
      name: string;
      execute: (...args: unknown[]) => Promise<unknown>;
      parameters: { properties: Record<string, unknown> };
    }> = [];
    const pi = {
      registerTool(tool: (typeof tools)[number]) {
        tools.push(tool);
      },
    };

    registerWorkspaceTools(
      pi as never,
      {
        list: vi.fn(),
        find: vi.fn(),
        create: vi.fn(),
        close: vi.fn(),
      } as never,
    );

    const tool = tools.find((entry) => entry.name === "workspace_create");
    if (!tool) {
      throw new Error("Expected workspace_create tool");
    }

    expect(tool.parameters.properties).not.toHaveProperty("taskRunAgentKind");
  });

  it("guides existing Task ID handoff through agent chat without blind retries", async () => {
    const tools: Array<{ name: string; promptGuidelines?: string[] }> = [];
    registerWorkspaceTools(
      {
        registerTool(tool: (typeof tools)[number]) {
          tools.push(tool);
        },
      } as never,
      { list: vi.fn(), find: vi.fn(), create: vi.fn(), close: vi.fn() },
    );
    const guidelines = tools.find((tool) => tool.name === "workspace_create")?.promptGuidelines?.join("\n") ?? "";
    const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
    for (const text of [guidelines, readme]) {
      expect(text).toContain("agent chat");
      expect(text).toContain("Task ID");
      expect(text).toMatch(/task_start[\s\S]*workspace_create[\s\S]*task_link_workspace/);
      expect(text).toContain("task_read");
      expect(text).toContain("without waiting for association");
      expect(text).toContain("Do not recreate the workspace or launch another run");
      expect(text).toMatch(/timeout[\s\S]*run failure[\s\S]*inspect/);
      expect(text).not.toMatch(/Pi CLI|existing task file/);
    }
  });

  it("routes workspace_create through the backend client", async () => {
    const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
    const create = vi.fn(async () => ({ workspaceId: "ws-1", localPath: "/tmp/ws-1", stdout: "Created: ws-1" }));
    const pi = {
      registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
        tools.push(tool);
      },
    };

    registerWorkspaceTools(
      pi as never,
      {
        list: vi.fn(),
        find: vi.fn(),
        create,
        close: vi.fn(),
      } as never,
    );

    const tool = tools.find((entry) => entry.name === "workspace_create");
    if (!tool) {
      throw new Error("Expected workspace_create tool");
    }

    const result = (await tool.execute(
      "tool-1",
      {
        projectId: "proj-1",
        branch: "feature/branch",
        sourceBranch: "main",
        name: "feature-branch",
      },
      undefined,
      undefined,
      {},
    )) as { content: Array<{ text?: string }>; details?: { workspaceId?: string; localPath?: string } };

    expect(create).toHaveBeenCalledWith({
      projectId: "proj-1",
      branch: "feature/branch",
      sourceBranch: "main",
      name: "feature-branch",
    });
    expect(result.content[0]?.text).toContain("ws-1");
    expect(result.details).toEqual({ workspaceId: "ws-1", localPath: "/tmp/ws-1" });
  });
  it.each(["started", "failed", undefined] as const)(
    "reports creation separately from run %s and forwards Task reference",
    async (status) => {
      const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
      const metadata = status
        ? { taskRunStatus: status, taskRunSessionId: "session-1", taskRunTitle: "Task reference" }
        : {};
      const create = vi.fn(async () => ({ workspaceId: "ws-run", stdout: "Created: ws-run", ...metadata }));
      registerWorkspaceTools({ registerTool: (tool: (typeof tools)[number]) => tools.push(tool) } as never, {
        list: vi.fn(),
        find: vi.fn(),
        close: vi.fn(),
        create,
      });
      const tool = tools.find((entry) => entry.name === "workspace_create");
      if (!tool) throw new Error("Expected workspace_create");
      const params = {
        projectId: "proj-1",
        branch: "feature/run",
        taskRunPrompt: "Task f9bc6915-efb6-427b-aa43-60c86da4d891",
        taskRunModel: "provider/model",
      };
      const result = (await tool.execute("call-1", params)) as {
        content: Array<{ text: string }>;
        details: Record<string, unknown>;
      };
      expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(params));
      expect(result.details).toEqual({ workspaceId: "ws-run", localPath: undefined, ...metadata });
      expect(result.content[0]?.text).toContain("Created workspace ws-run");
      if (status) {
        expect(result.content[0]?.text).toContain(`Task run: ${status}`);
        expect(result.content[0]?.text).toContain("session-1");
      }
      if (status === "failed") expect(result.content[0]?.text).toMatch(/inspect[\s\S]*before[\s\S]*retry/i);
      if (!status) expect(result.content[0]?.text).not.toContain("Task run:");
    },
  );
});
