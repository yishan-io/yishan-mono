import { Context } from "@deepseek-ai/cordis";
import { CallId } from "@deepseek-ai/dsh-llm";
import { SubagentDepthError, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";

import { installDelegationTools } from "./delegationTools";

function createContext(): Context {
  const context = new Context();
  new SubagentRuntime(context);
  context.tools = {
    get: vi.fn(),
    register: vi.fn(),
  } as never;
  return context;
}

function createExecution(agent?: object): ToolRunContext {
  return {
    callId: CallId("delegation"),
    rootCallId: CallId("delegation"),
    name: "delegate",
    arguments: {},
    signal: new AbortController().signal,
    token: Symbol("delegation"),
    ...(agent ? { agent } : {}),
    deferContext: () => undefined,
    concludeTurn: () => undefined,
  } as unknown as ToolRunContext;
}

describe("fixed-role delegation tools", () => {
  it("defines only a task schema and removes generic delegation", () => {
    const context = createContext();
    installDelegationTools(context);

    const definitions = vi.mocked(context.tools.register).mock.calls.map(([definition]) => definition);
    expect(definitions.map(({ name }) => name)).toEqual(["delegate_explore", "delegate_builder"]);
    for (const definition of definitions) {
      expect(definition.parameters).toEqual({
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "The complete, standalone task description for the delegated role.",
          },
        },
        required: ["task"],
      });
      expect(definition.name).not.toBe("subagent");
    }
  });

  it("projects the durable child id as bounded presentation metadata", () => {
    const context = createContext();
    installDelegationTools(context);
    const definition = vi.mocked(context.tools.register).mock.calls[0]?.[0];
    if (!definition?.output.presentationMeta)
      throw new Error("delegate_explore presentation metadata was not registered");

    expect(definition.output.presentationMeta({ task: "inspect" }, { childId: "child-id" })).toEqual({
      delegation: { version: 1, childId: "child-id" },
    });
  });

  it("persists the fixed child sandbox mode again when a child cold-resumes", () => {
    const context = createContext();
    const registerSetup = vi.spyOn(context.subagents, "registerContinuableSetup");
    installDelegationTools(context);
    const setup = registerSetup.mock.calls[0]?.[0];
    if (!setup) throw new Error("continuable child setup was not registered");

    const appended: Array<{ type: string; data: unknown }> = [];
    const childContext = {
      agent: {
        session: {
          events: [
            {
              type: "subagent/descriptor",
              data: {
                version: 2,
                mode: "continuable",
                provider: "spawn",
                label: "Explore task",
                persona:
                  "Investigate the assigned task. Inspect files and report concise evidence. Your filesystem policy is enforced as read-only.",
                toolFilter: { allow: ["bash", "skill"] },
              },
            },
          ],
          append(type: string, data: unknown) {
            appended.push({ type, data });
          },
        },
      },
      sandboxPolicy: { resolve: () => ({ mode: "danger-full-access" }) },
    } as unknown as Context;

    setup(childContext);
    setup(childContext);
    expect(appended).toEqual([
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "sandbox/mode", data: { mode: "read-only" } },
    ]);
  });

  it("clamps a danger-full-access builder parent to workspace-write", () => {
    const context = createContext();
    const registerSetup = vi.spyOn(context.subagents, "registerContinuableSetup");
    installDelegationTools(context);
    const setup = registerSetup.mock.calls[0]?.[0];
    if (!setup) throw new Error("continuable child setup was not registered");

    const append = vi.fn();
    setup({
      agent: {
        session: {
          events: [
            {
              type: "subagent/descriptor",
              data: {
                version: 2,
                mode: "continuable",
                provider: "spawn",
                label: "Build task",
                persona:
                  "Implement the assigned task. Make focused changes and verify them. Your filesystem policy is enforced by the runtime.",
                toolFilter: { allow: ["bash", "skill"] },
              },
            },
          ],
          append,
        },
      },
      sandboxPolicy: { resolve: () => ({ mode: "danger-full-access" }) },
    } as unknown as Context);
    expect(append).toHaveBeenCalledWith("sandbox/mode", { mode: "workspace-write" });
  });

  it.each(["read-only", "workspace-write"] as const)("preserves the builder's %s parent mode", (parentMode) => {
    const context = createContext();
    const registerSetup = vi.spyOn(context.subagents, "registerContinuableSetup");
    installDelegationTools(context);
    const setup = registerSetup.mock.calls[0]?.[0];
    if (!setup) throw new Error("continuable child setup was not registered");
    const append = vi.fn();
    setup({
      agent: {
        session: {
          events: [
            {
              type: "subagent/descriptor",
              data: {
                version: 2,
                mode: "continuable",
                provider: "spawn",
                label: "Build task",
                persona:
                  "Implement the assigned task. Make focused changes and verify them. Your filesystem policy is enforced by the runtime.",
                toolFilter: { allow: ["bash", "skill"] },
              },
            },
          ],
          append,
        },
      },
      sandboxPolicy: { resolve: () => ({ mode: parentMode }) },
    } as unknown as Context);
    expect(append).toHaveBeenCalledWith("sandbox/mode", { mode: parentMode });
  });

  it("rejects agentless calls without starting a child", async () => {
    const context = createContext();
    const startContinuable = vi.spyOn(context.subagents, "startContinuable");
    installDelegationTools(context);
    const definition = vi.mocked(context.tools.register).mock.calls[0]?.[0];
    if (!definition) throw new Error("delegate_explore was not registered");

    await expect(definition.execute({ task: "inspect this" }, createExecution())).rejects.toThrow(
      "delegate_explore requires a calling agent",
    );
    expect(startContinuable).not.toHaveBeenCalled();
  });

  it("uses only exec.agent as the exact direct parent and enforces depth one", async () => {
    const context = createContext();
    const startContinuable = vi.spyOn(context.subagents, "startContinuable").mockResolvedValue({
      childId: "child-id" as never,
      messageId: "message-id" as never,
    });
    installDelegationTools(context);
    const definition = vi.mocked(context.tools.register).mock.calls[1]?.[0];
    if (!definition) throw new Error("delegate_builder was not registered");
    const parent = { options: { provider: "provider", model: "model" } };

    await expect(definition.execute({ task: "implement this" }, createExecution(parent))).resolves.toEqual({
      childId: "child-id",
    });

    expect(startContinuable).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "spawn",
        label: "Build task",
        request: expect.objectContaining({
          parent,
          maxDepth: 1,
          prompt: [{ type: "text", text: "implement this" }],
        }),
      }),
    );
    expect(startContinuable.mock.calls[0]?.[0].request).not.toHaveProperty("agentOptions");
  });

  it("surfaces the provider depth rejection", async () => {
    const context = createContext();
    vi.spyOn(context.subagents, "startContinuable").mockRejectedValue(new SubagentDepthError(2, 1));
    installDelegationTools(context);
    const definition = vi.mocked(context.tools.register).mock.calls[0]?.[0];
    if (!definition) throw new Error("delegate_explore was not registered");

    await expect(definition.execute({ task: "nested" }, createExecution({}))).rejects.toMatchObject({
      attemptedDepth: 2,
      maxDepth: 1,
    });
  });
});
