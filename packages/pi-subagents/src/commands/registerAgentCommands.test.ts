import { describe, expect, it, vi } from "vitest";

import type { AgentDefinition } from "../agents/types";
import { CompletionOwner } from "../delivery/completionOwner";
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
    getThinkingLevel: vi.fn(() => "medium"),
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
      undefined,
    );
    expect(notify).toHaveBeenCalledWith("Started Explore as agent-1", "info");
  });

  it("does not register /agent-send, with or without a completion owner", () => {
    for (const owner of [
      undefined,
      new CompletionOwner({ sessionId: "parent", lifetime: "one", send: vi.fn(), warn: vi.fn() }),
    ]) {
      const { commands, sendUserMessage, pi } = createCommandHarness();
      registerAgentCommands(pi as never, {} as never, {} as never, owner);
      expect(commands.has("agent-send")).toBe(false);
      expect(sendUserMessage).not.toHaveBeenCalled();
    }
  });

  it.each([false, true])(
    "enrolls every slash launch before zero-duration execution (background=%s)",
    async (background) => {
      const { commands, pi } = createCommandHarness();
      const owner = new CompletionOwner({ sessionId: "parent", lifetime: "one", send: vi.fn(), warn: vi.fn() });
      const enroll = vi.spyOn(owner, "enroll");
      const launch = vi.fn(async (_task, options) => {
        expect(options.parent).toEqual({ ...owner.parent, source: "command" });
        options.onAdmitted("instant");
        expect(enroll).toHaveBeenCalledWith("instant");
        return background ? "instant" : { agentId: "instant", agentName: "Explore", status: "completed" };
      });
      registerAgentCommands(
        pi as never,
        { reload: vi.fn(), getByName: () => testAgentDefinition } as never,
        { run: launch, runInBackground: launch } as never,
        owner,
      );
      const ctx = {
        cwd: "/tmp",
        sessionManager: { getSessionId: () => "parent", getSessionFile: () => undefined },
        ui: { notify: vi.fn() },
      };
      await commands.get("agent")?.handler(`Explore ${background ? "--background " : ""}go`, ctx);
      expect(launch).toHaveBeenCalledTimes(1);
      owner.close();
      await expect(commands.get("agent")?.handler("Explore go", ctx)).rejects.toThrow("closed");
      expect(launch).toHaveBeenCalledTimes(1);
    },
  );
});
