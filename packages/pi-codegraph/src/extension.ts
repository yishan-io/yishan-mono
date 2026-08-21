import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type CodeGraphCall, CodeGraphMcpClient } from "./mcp/client";
import { CODEGRAPH_TOOLS, type CodeGraphToolDefinition } from "./tools";

const STRUCTURAL_NAVIGATION_GUIDANCE =
  "Use CodeGraph first for structural code navigation. For broad questions, start with codegraph_explore. If codegraph_search returns no results, try codegraph_explore, codegraph_files, or codegraph_node before falling back. Use grep or direct file reads only when CodeGraph results are insufficient or you need literal text matching.";

/** Native MCP caller used by the registered CodeGraph Pi tools. */
export interface CodeGraphMcpCaller {
  /** Runs a single bounded CodeGraph MCP tool call. */
  call(call: CodeGraphCall): ReturnType<CodeGraphMcpClient["call"]>;
}

/** Registers the frozen CodeGraph tool surface and structural-navigation guidance. */
export function createPiCodeGraphExtension(
  pi: ExtensionAPI,
  client: CodeGraphMcpCaller = new CodeGraphMcpClient(),
): void {
  for (const tool of CODEGRAPH_TOOLS) {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      promptSnippet: `Use ${tool.name} for CodeGraph structural code navigation.`,
      promptGuidelines: [
        `Use ${tool.name} when its structural code-navigation result is more precise than text search.`,
      ],
      parameters: tool.parameters,
      async execute(_toolCallId, parameters, signal, _onUpdate, ctx) {
        const projectPath = parameters.projectPath;
        const response = await client.call({
          toolName: tool.mcpMethod,
          arguments: buildMcpArguments(tool, parameters),
          projectPath,
          cwd: ctx.cwd,
          signal,
        });
        return {
          content: [{ type: "text", text: response.text }],
          details: response.details,
        };
      },
    });
  }

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${STRUCTURAL_NAVIGATION_GUIDANCE}`,
  }));
}

function buildMcpArguments(
  tool: CodeGraphToolDefinition,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(getProperties(tool.parameters))
      .filter(([name]) => name !== "projectPath")
      .flatMap(([name, schema]) => {
        const value = parameters[name];
        if (value !== undefined) return [[name, value]];
        if (hasDefault(schema)) return [[name, schema.default]];
        return [];
      }),
  );
}

function getProperties(schema: unknown): object {
  if (typeof schema !== "object" || schema === null || !("properties" in schema)) return {};
  const { properties } = schema;
  return typeof properties === "object" && properties !== null ? properties : {};
}

function hasDefault(schema: unknown): schema is { default: unknown } {
  return typeof schema === "object" && schema !== null && "default" in schema;
}
