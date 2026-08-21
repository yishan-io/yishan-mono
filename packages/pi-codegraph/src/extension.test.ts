import { describe, expect, it } from "vitest";

import { createPiCodeGraphExtension } from "./extension";
import type { CodeGraphCall } from "./mcp/client";
import { CODEGRAPH_TOOLS } from "./tools";

interface RegisteredTool {
  readonly name: string;
  readonly execute: (
    toolCallId: string,
    parameters: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    context: { cwd: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
}

describe("createPiCodeGraphExtension", () => {
  it("registers every frozen tool and structural-navigation guidance", async () => {
    const tools: Array<{ name: string; promptSnippet?: string; promptGuidelines?: string[] }> = [];
    const handlers = new Map<string, (event: { systemPrompt: string }) => unknown>();
    const pi = {
      registerTool(tool: { name: string; promptSnippet?: string; promptGuidelines?: string[] }) {
        tools.push(tool);
      },
      on(name: string, handler: (event: { systemPrompt: string }) => unknown) {
        handlers.set(name, handler);
      },
    };

    createPiCodeGraphExtension(pi as never);

    expect(tools.map((tool) => tool.name)).toEqual([
      "codegraph_search",
      "codegraph_callers",
      "codegraph_callees",
      "codegraph_impact",
      "codegraph_explore",
      "codegraph_node",
      "codegraph_status",
      "codegraph_files",
    ]);
    expect(tools.every((tool) => tool.promptSnippet && tool.promptGuidelines?.length)).toBe(true);

    const beforeAgentStart = handlers.get("before_agent_start");
    if (!beforeAgentStart) throw new Error("Expected before_agent_start handler");
    await expect(beforeAgentStart({ systemPrompt: "base" })).resolves.toEqual({
      systemPrompt:
        "base\n\nUse CodeGraph first for structural code navigation. For broad questions, start with codegraph_explore. If codegraph_search returns no results, try codegraph_explore, codegraph_files, or codegraph_node before falling back. Use grep or direct file reads only when CodeGraph results are insufficient or you need literal text matching.",
    });
  });

  it.each([
    ["codegraph_search", { query: "find", kind: "function" }, { query: "find", kind: "function", limit: 10 }],
    ["codegraph_callers", { symbol: "greet" }, { symbol: "greet", limit: 20 }],
    ["codegraph_callees", { symbol: "greet", limit: 7 }, { symbol: "greet", limit: 7 }],
    ["codegraph_impact", { symbol: "greet" }, { symbol: "greet", depth: 2 }],
    ["codegraph_explore", { query: "entry point" }, { query: "entry point", maxFiles: 12 }],
    ["codegraph_node", { symbol: "greet" }, { symbol: "greet", includeCode: false }],
    ["codegraph_status", {}, {}],
    [
      "codegraph_files",
      { path: "src", pattern: "**/*.ts", maxDepth: 3 },
      { path: "src", pattern: "**/*.ts", format: "tree", includeMetadata: true, maxDepth: 3 },
    ],
  ] as const)("forwards %s with exact MCP arguments and defaults", async (toolName, parameters, expectedArguments) => {
    const calls: CodeGraphCall[] = [];
    const pi = {
      registerTool(tool: RegisteredTool) {
        if (tool.name === toolName) registeredTool = tool;
      },
      on() {},
    };
    let registeredTool: RegisteredTool | undefined;
    const client = {
      async call(call: CodeGraphCall) {
        calls.push(call);
        return { text: `response for ${call.toolName}`, details: undefined };
      },
    };

    createPiCodeGraphExtension(pi as never, client);

    if (!registeredTool) throw new Error(`Expected ${toolName} to be registered`);
    const controller = new AbortController();
    await expect(
      registeredTool.execute(
        "tool-call",
        { ...parameters, projectPath: "/explicit-project" },
        controller.signal,
        undefined,
        {
          cwd: "/context-project",
        },
      ),
    ).resolves.toEqual({
      content: [{ type: "text", text: `response for ${toolName}` }],
      details: undefined,
    });
    expect(calls).toEqual([
      {
        toolName,
        arguments: expectedArguments,
        projectPath: "/explicit-project",
        cwd: "/context-project",
        signal: controller.signal,
      },
    ]);
  });

  it("uses the Pi execution cwd when projectPath is omitted and propagates MCP failures", async () => {
    let call: CodeGraphCall | undefined;
    const pi = {
      registerTool(tool: RegisteredTool) {
        if (tool.name === "codegraph_status") registeredTool = tool;
      },
      on() {},
    };
    let registeredTool: RegisteredTool | undefined;
    const client = {
      async call(nextCall: CodeGraphCall) {
        call = nextCall;
        throw new Error("MCP unavailable");
      },
    };

    createPiCodeGraphExtension(pi as never, client);

    if (!registeredTool) throw new Error("Expected codegraph_status to be registered");
    await expect(
      registeredTool.execute("tool-call", {}, undefined, undefined, { cwd: "/context-project" }),
    ).rejects.toThrow("MCP unavailable");
    expect(call).toEqual({
      toolName: "codegraph_status",
      arguments: {},
      projectPath: undefined,
      cwd: "/context-project",
      signal: undefined,
    });
  });

  it("keeps the complete frozen tool surface executable", () => {
    expect(CODEGRAPH_TOOLS).toHaveLength(8);
  });
});
