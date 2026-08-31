import { describe, expect, it, vi } from "vitest";

import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import {
  type WorkspaceCapabilityRequest,
  type WorkspaceCapabilityTransport,
  createWorkspaceClientResolver,
} from "@yishan-io/dsh-daemon-bridge";

import { registerWorkspaceTools } from "./plugin";

type RegisteredTool = {
  name: string;
  parameters: Record<string, unknown>;
  execute: (arguments_: unknown, execution: unknown) => Promise<unknown>;
  output: { render: (arguments_: unknown, value: unknown) => Array<{ type: string; text: string }> };
};

const identity = { sessionId: "session-1", workspaceId: "workspace-1", generation: 2 };

describe("workspace tool plugin", () => {
  it("registers the four workspace lifecycle tools", () => {
    const registeredTools: RegisteredTool[] = [];

    registerWorkspaceTools(createContext(registeredTools) as never, createResolver(createTransport()));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "workspace_list",
      "workspace_find",
      "workspace_create",
      "workspace_close",
    ]);
  });

  it("derives a real bridge client from the current execution and renders canonical JSON", async () => {
    const response = { workspaceId: "workspace-1", localPath: "/workspaces/one", stdout: "created" };
    const transport = createTransport(response);
    const { tool, execution } = registerTool("workspace_create", transport);
    const arguments_ = { projectId: "project-1", branch: "feature/one", sourceBranch: "main", name: "one" };

    const result = await tool.execute(arguments_, execution);

    expect(getOnlyRequest(transport)).toMatchObject({ operation: "workspace.create", input: arguments_, ...identity });
    expect(result).toEqual(response);
    expect(tool.output.render(arguments_, result)).toEqual([{ type: "text", text: JSON.stringify(result, null, 2) }]);
  });

  it.each([
    ["workspace_list", { projectId: "project-1", orgId: "org-1" }, "workspace.list", { workspaces: [] }],
    [
      "workspace_find",
      { projectId: "project-1", workspaceId: "workspace-1" },
      "workspace.find",
      { workspace: { id: "workspace-1" } },
    ],
    [
      "workspace_close",
      { projectId: "project-1", workspaceId: "workspace-1" },
      "workspace.close",
      { workspace: { id: "workspace-1" } },
    ],
  ])("sends %s through the real bridge resolver", async (toolName, arguments_, operation, response) => {
    const transport = createTransport(response);
    const { tool, execution } = registerTool(toolName, transport);

    await expect(tool.execute(arguments_, execution)).resolves.toEqual(response);

    expect(getOnlyRequest(transport)).toMatchObject({ operation, input: arguments_, ...identity });
  });
});

function createContext(registeredTools: RegisteredTool[]) {
  return { tools: { register: (tool: RegisteredTool) => registeredTools.push(tool) } };
}

function createTransport(response: unknown = { workspaces: [] }): WorkspaceCapabilityTransport {
  return { requestWorkspaceCapability: vi.fn(async () => response) };
}

function createResolver(transport: WorkspaceCapabilityTransport) {
  return createWorkspaceClientResolver(transport, () => identity);
}

function registerTool(toolName: string, transport: WorkspaceCapabilityTransport) {
  const registeredTools: RegisteredTool[] = [];
  registerWorkspaceTools(createContext(registeredTools) as never, createResolver(transport));
  const tool = registeredTools.find((registeredTool) => registeredTool.name === toolName);
  if (tool === undefined) throw new Error(`${toolName} was not registered`);
  const execution = { signal: new AbortController().signal, agent: { id: "session-1" } } as ToolRunContext;
  return { tool, execution };
}

function getOnlyRequest(transport: WorkspaceCapabilityTransport): WorkspaceCapabilityRequest {
  const requests = vi.mocked(transport.requestWorkspaceCapability).mock.calls;
  const request = requests[0]?.[0];
  if (request === undefined) throw new Error("expected one workspace capability request");
  expect(requests).toHaveLength(1);
  return request;
}
