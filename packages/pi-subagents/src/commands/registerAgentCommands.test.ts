import { describe, expect, it, vi } from "vitest";

import type { AgentDefinition } from "../agents/types";
import { registerAgentCommands } from "./registerAgentCommands";

const testAgentDefinition: AgentDefinition = {
  name: "Explore",
  description: "Search the codebase",
  systemPrompt: "Explore prompt",
  source: "builtin",
  tools: ["read", "grep"],
  readOnly: true,
};

function createCommandHarness() {
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  const sendUserMessage = vi.fn();
  const pi = {
    registerCommand(name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) {
      commands.set(name, options);
    },
    sendUserMessage,
  };

  return { commands, sendUserMessage, pi };
}

describe("registerAgentCommands", () => {
  it("registers /agent and starts a background run when requested", async () => {
    const { commands, pi } = createCommandHarness();
    const registry = {
      reload: vi.fn(),
      list: vi.fn(() => [testAgentDefinition]),
      getByName: vi.fn(() => testAgentDefinition),
    };
    const manager = {
      runInBackground: vi.fn(async () => "agent-1"),
      list: vi.fn(() => []),
    };
    const notify = vi.fn();

    registerAgentCommands(pi as never, registry as never, manager as never);
    const command = commands.get("agent");
    if (!command) {
      throw new Error("Expected /agent command to be registered");
    }

    await command.handler("Explore --background inspect auth", {
      cwd: "/tmp/project",
      sessionManager: {
        getSessionId: () => "parent-session-1",
        getSessionFile: () => "/tmp/shared-sessions/parent-session-1.jsonl",
        appendCustomEntry: vi.fn(),
      },
      ui: { notify },
    });

    expect(manager.runInBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "Explore",
        agentDefinition: testAgentDefinition,
        prompt: "inspect auth",
        cwd: "/tmp/project",
        mode: "background",
        parentSession: {
          sessionId: "parent-session-1",
          sessionPath: "/tmp/shared-sessions/parent-session-1.jsonl",
          cwd: "/tmp/project",
        },
        childSessionDescriptor: {
          title: "Explore — inspect auth",
          summary: "inspect auth",
        },
        tools: ["read", "grep"],
        model: undefined,
        thinking: undefined,
        maxTurns: undefined,
        timeoutMs: undefined,
        workspaceAccess: "read",
      }),
    );
    expect(notify).toHaveBeenCalledWith("Started Explore as agent-1", "info");
  });

  it("registers /agent-send and queues completed results for the main agent", async () => {
    const { commands, sendUserMessage, pi } = createCommandHarness();
    const registry = {
      reload: vi.fn(),
      list: vi.fn(() => [testAgentDefinition]),
      getByName: vi.fn(() => testAgentDefinition),
    };
    const manager = {
      collectResults: vi.fn(() => '<subagent name="Explore">Done</subagent>'),
      list: vi.fn(() => [{ id: "agent-1" }]),
    };
    const notify = vi.fn();

    registerAgentCommands(pi as never, registry as never, manager as never);
    const command = commands.get("agent-send");
    if (!command) {
      throw new Error("Expected /agent-send command to be registered");
    }

    await command.handler("agent-1", {
      isIdle: () => true,
      ui: { notify },
    });

    expect(sendUserMessage).toHaveBeenCalledWith(
      'The following sub-agents completed their tasks.\n\n<subagent name="Explore">Done</subagent>\n\nReview the findings, resolve conflicts, and produce the final response.',
    );
    expect(notify).toHaveBeenCalledWith("Queued sub-agent results for the main agent", "info");
  });
});
