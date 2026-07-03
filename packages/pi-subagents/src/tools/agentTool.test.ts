import { describe, expect, it, vi } from "vitest";

import type { AgentDefinition } from "../agents/types";
import { registerAgentTool } from "./agentTool";

const testAgentDefinition: AgentDefinition = {
  name: "Explore",
  description: "Search the codebase",
  systemPrompt: "Explore prompt",
  source: "builtin",
  tools: ["read", "grep"],
  readOnly: true,
};

function createToolHarness() {
  let registeredTool:
    | {
        execute: (
          toolCallId: string,
          params: { agent: string; prompt: string; background?: boolean },
          signal?: AbortSignal,
          onUpdate?: unknown,
          ctx?: unknown,
        ) => Promise<unknown>;
      }
    | undefined;

  const pi = {
    registerTool(tool: {
      execute: (
        toolCallId: string,
        params: { agent: string; prompt: string; background?: boolean },
        signal?: AbortSignal,
        onUpdate?: unknown,
        ctx?: unknown,
      ) => Promise<unknown>;
    }) {
      registeredTool = tool;
    },
  };

  return {
    pi,
    getRegisteredTool() {
      if (!registeredTool) {
        throw new Error("Expected Agent tool to be registered");
      }
      return registeredTool;
    },
  };
}

describe("registerAgentTool", () => {
  it("runs the requested agent through the shared manager", async () => {
    const { pi, getRegisteredTool } = createToolHarness();
    const registry = {
      reload: vi.fn(),
      getByName: vi.fn(() => testAgentDefinition),
    };
    const manager = {
      run: vi.fn(async () => ({
        agentId: "agent-1",
        agentName: "Explore",
        status: "completed",
        responseText: "Done",
        transcriptPath: "/tmp/project/.pi/output/agents/agent-1.jsonl",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0,
          contextTokens: 0,
          turns: 0,
        },
      })),
    };

    registerAgentTool(pi as never, registry as never, manager as never);
    const result = await getRegisteredTool().execute(
      "tool-1",
      { agent: "Explore", prompt: "Inspect auth" },
      undefined,
      undefined,
      { cwd: "/tmp/project" },
    );

    expect(manager.run).toHaveBeenCalledWith({
      agentName: "Explore",
      agentDefinition: testAgentDefinition,
      prompt: "Inspect auth",
      cwd: "/tmp/project",
      mode: "foreground",
      tools: ["read", "grep"],
      model: undefined,
      thinking: undefined,
      maxTurns: undefined,
      timeoutMs: undefined,
      readOnly: true,
    });
    expect(result).toEqual({
      content: [{ type: "text", text: "Done" }],
      details: {
        agentId: "agent-1",
        status: "completed",
        transcriptPath: "/tmp/project/.pi/output/agents/agent-1.jsonl",
      },
    });
  });
});
