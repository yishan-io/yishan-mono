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
});
