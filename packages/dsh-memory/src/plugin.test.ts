import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import type { CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";
import { describe, expect, it, vi } from "vitest";

import type { MemoryCapabilityRequest } from "./client";
import { registerMemoryTools } from "./plugin";

type RegisteredTool = {
  name: string;
  execute: (arguments_: never, execution: ToolRunContext) => Promise<unknown>;
  output: { render: (arguments_: unknown, value: never) => Array<{ type: string; text: string }> };
};
const identity = { sessionId: "session-1", workspaceId: "workspace-1", generation: 2 };

describe("dsh memory plugin", () => {
  it("registers all durable memory tools", () => {
    const tools: RegisteredTool[] = [];
    registerMemoryTools(createContext(tools) as never, createTransport({}), () => identity);
    expect(tools.map(({ name }) => name)).toEqual(["memory_search", "memory_read", "memory_store", "memory_reconcile"]);
  });

  it("rejects tool execution without an agent-scoped identity", async () => {
    const tools: RegisteredTool[] = [];
    registerMemoryTools(createContext(tools) as never, createTransport({}), () => identity);
    const tool = tools.find(({ name }) => name === "memory_search");
    if (tool === undefined) throw new Error("memory_search was not registered");

    await expect(
      tool.execute({ query: "bridge" } as never, { signal: new AbortController().signal } as never),
    ).rejects.toThrow("agent-scoped");
  });

  it.each([
    ["memory_search", { query: "bridge", scope: "project" }, "memory.search", []],
    [
      "memory_read",
      { projectRoot: "/workspace", path: "MEMORY.md" },
      "memory.read",
      { path: "MEMORY.md", content: "memory" },
    ],
    [
      "memory_store",
      { section: "locked_decisions", entry: "Use typed capabilities", date: "2026-09-01" },
      "memory.store",
      { path: "/workspace/.my-context/MEMORY.md", section: "locked_decisions" },
    ],
    ["memory_reconcile", {}, "memory.reconcile", { inserted: 1, updated: 0, deleted: 0 }],
  ])("routes %s through the memory capability client", async (toolName, input, operation, response) => {
    const transport = createTransport(response);
    const tools: RegisteredTool[] = [];
    registerMemoryTools(createContext(tools) as never, transport, () => identity);
    const tool = tools.find(({ name }) => name === toolName);
    if (tool === undefined) throw new Error(`${toolName} was not registered`);

    await expect(tool.execute(input as never, execution())).resolves.toEqual(response);
    expect(getOnlyRequest(transport)).toMatchObject({ ...identity, operation, input });
  });
});

function createContext(tools: RegisteredTool[]) {
  return { tools: { register: (tool: RegisteredTool) => tools.push(tool) } };
}

function createTransport(response: unknown): CapabilityTransport<MemoryCapabilityRequest> {
  return { requestCapability: vi.fn(async () => response) };
}

function execution(): ToolRunContext {
  return { signal: new AbortController().signal, agent: { id: "session-1" } } as ToolRunContext;
}

function getOnlyRequest(transport: CapabilityTransport<MemoryCapabilityRequest>): MemoryCapabilityRequest {
  const requests = vi.mocked(transport.requestCapability).mock.calls;
  const request = requests[0]?.[0];
  if (request === undefined) throw new Error("expected one memory capability request");
  expect(requests).toHaveLength(1);
  return request;
}
