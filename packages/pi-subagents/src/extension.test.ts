import { describe, expect, it, vi } from "vitest";

const {
  addAutocompleteProviderMock,
  bindAgentProgressUiMock,
  clearAgentProgressMock,
  clearSelectedAgentDetailsMock,
  disposeAgentProgressUiMock,
  managerMock,
  notifyMock,
  onTerminalInputMock,
  registerAgentCommandsMock,
  registerAgentToolMock,
  registryMock,
  renderPendingDelegationMock,
  renderSelectedAgentDetailsMock,
} = vi.hoisted(() => {
  const disposeAgentProgressUiMock = vi.fn();

  return {
    addAutocompleteProviderMock: vi.fn(),
    bindAgentProgressUiMock: vi.fn(() => disposeAgentProgressUiMock),
    clearAgentProgressMock: vi.fn(),
    clearSelectedAgentDetailsMock: vi.fn(),
    disposeAgentProgressUiMock,
    onTerminalInputMock: vi.fn(() => vi.fn()),
    managerMock: {
      run: vi.fn(async (_task: unknown) => ({
        agentId: "agent-1",
        agentName: "Explore",
        status: "completed",
        responseText: "Done",
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
      runParallel: vi.fn(async (_tasks: unknown[]) => []),
      get: vi.fn((_agentId: string) => ({
        id: "agent-1",
        agentName: "Explore",
        prompt: "Inspect auth",
        status: "running",
        mode: "foreground",
        createdAt: 1,
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
      list: vi.fn(() => [{ id: "agent-1", agentName: "Explore", status: "running" }]),
      subscribe: vi.fn((listener: (records: unknown[]) => void) => {
        listener([]);
        return vi.fn();
      }),
      stop: vi.fn(async (_agentId: string) => {}),
      shutdown: vi.fn(async () => []),
    },
    notifyMock: vi.fn(),
    registerAgentCommandsMock: vi.fn(),
    registerAgentToolMock: vi.fn(),
    renderPendingDelegationMock: vi.fn(),
    renderSelectedAgentDetailsMock: vi.fn(),
    registryMock: {
      reload: vi.fn(),
      list: vi.fn(() => [
        {
          name: "Explore",
          description: "Search the codebase",
          systemPrompt: "Explore prompt",
          source: "builtin",
          tools: ["read", "grep"],
          readOnly: true,
        },
      ]),
      getByName: vi.fn((_name: string) => ({
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        source: "builtin",
        tools: ["read", "grep"],
        readOnly: true,
      })),
    },
  };
});

vi.mock("./agents/registry", () => ({
  AgentRegistry: class {
    reload() {
      return registryMock.reload();
    }

    list() {
      return registryMock.list();
    }

    getByName(name: string) {
      return registryMock.getByName(name);
    }
  },
}));

vi.mock("./runtime/agentManager", () => ({
  AgentManager: class {
    run(task: unknown) {
      return managerMock.run(task);
    }

    runParallel(tasks: unknown[]) {
      return managerMock.runParallel(tasks);
    }

    get(agentId: string) {
      return managerMock.get(agentId);
    }

    list() {
      return managerMock.list();
    }

    subscribe(listener: (records: unknown[]) => void) {
      return managerMock.subscribe(listener);
    }

    stop(agentId: string) {
      return managerMock.stop(agentId);
    }

    shutdown() {
      return managerMock.shutdown();
    }
  },
}));

vi.mock("./commands/registerAgentCommands", () => ({
  registerAgentCommands: registerAgentCommandsMock,
}));

vi.mock("./tools/agentTool", () => ({
  registerAgentTool: registerAgentToolMock,
}));

vi.mock("./input/autocompleteProvider", () => ({
  createAgentAutocompleteProvider: vi.fn(() => ({ kind: "provider" })),
}));

vi.mock("./ui/agentProgress", () => ({
  bindAgentProgressUi: bindAgentProgressUiMock,
  clearAgentProgress: clearAgentProgressMock,
  renderPendingDelegation: renderPendingDelegationMock,
}));

vi.mock("./ui/agentDetails", () => ({
  clearSelectedAgentDetails: clearSelectedAgentDetailsMock,
  renderSelectedAgentDetails: renderSelectedAgentDetailsMock,
}));

import { createPiSubagentsExtension } from "./extension";

describe("createPiSubagentsExtension", () => {
  it("registers commands/tools and wires lifecycle handlers", async () => {
    const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
    const shortcuts = new Map<string, { handler: (ctx: unknown) => Promise<void> }>();
    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    const pi = {
      on(eventName: string, handler: (event: unknown, ctx?: unknown) => unknown) {
        handlers.set(eventName, handler);
      },
      registerCommand(name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) {
        commands.set(name, options);
      },
      registerShortcut(key: string, options: { handler: (ctx: unknown) => Promise<void> }) {
        shortcuts.set(key, options);
      },
    };

    createPiSubagentsExtension(pi as never);

    expect(registerAgentCommandsMock).toHaveBeenCalledTimes(1);
    expect(registerAgentToolMock).toHaveBeenCalledTimes(1);

    const sessionStartHandler = handlers.get("session_start");
    if (!sessionStartHandler) {
      throw new Error("Expected session_start handler");
    }
    await sessionStartHandler(
      {},
      { ui: { addAutocompleteProvider: addAutocompleteProviderMock, onTerminalInput: onTerminalInputMock } },
    );
    expect(addAutocompleteProviderMock).toHaveBeenCalledTimes(1);
    expect(bindAgentProgressUiMock).toHaveBeenCalledTimes(1);
    expect(onTerminalInputMock).toHaveBeenCalledTimes(1);

    const inputHandler = handlers.get("input");
    if (!inputHandler) {
      throw new Error("Expected input handler");
    }
    const inputResult = await inputHandler(
      { text: "@agent:Explore inspect auth", images: [{ type: "image", data: "abc", mimeType: "image/png" }] },
      {
        cwd: "/tmp/project",
        ui: { notify: notifyMock },
      },
    );
    expect(managerMock.run).not.toHaveBeenCalled();
    expect(inputResult).toEqual({ action: "continue" });
    expect(renderPendingDelegationMock).toHaveBeenCalledWith(expect.any(Object), ["Explore"]);
    expect(notifyMock).not.toHaveBeenCalled();

    const contextHandler = handlers.get("context");
    if (!contextHandler) {
      throw new Error("Expected context handler");
    }
    const contextResult = await contextHandler({
      messages: [
        {
          role: "user",
          content: "@agent:Explore inspect auth",
          timestamp: 1,
        },
      ],
    });
    expect(contextResult).toEqual({
      messages: [
        {
          role: "user",
          content:
            "Use the Agent tool to delegate the task below to the named sub-agent. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. Once delegated, do not duplicate the same work yourself. Wait for the result or continue only with non-overlapping tasks. In the Agent prompt, specify whether the sub-agent should do research or make code changes, point it to the most relevant files or directories, and tell it what result to return. Wait for the sub-agent result, continue the work yourself, and then give the final response to the user.\n\nSub-agent: Explore\n\nTask:\ninspect auth",
          timestamp: 1,
        },
      ],
    });

    const toolExecutionStartHandler = handlers.get("tool_execution_start");
    if (!toolExecutionStartHandler) {
      throw new Error("Expected tool_execution_start handler");
    }
    await toolExecutionStartHandler({ toolName: "Agent" });

    await inputHandler(
      { text: "@agent:Explore inspect auth" },
      {
        cwd: "/tmp/project",
        ui: { notify: notifyMock },
      },
    );

    const agentEndHandler = handlers.get("agent_end");
    if (!agentEndHandler) {
      throw new Error("Expected agent_end handler");
    }
    managerMock.list.mockReturnValue([]);
    await agentEndHandler({}, { ui: {} });
    expect(clearAgentProgressMock).toHaveBeenCalledTimes(1);

    const agentViewCommand = commands.get("agent-view");
    if (!agentViewCommand) {
      throw new Error("Expected agent-view command");
    }
    managerMock.list.mockReturnValue([{ id: "agent-1", agentName: "Explore", status: "running" }]);
    await agentViewCommand.handler("agent-1", { ui: { notify: notifyMock } });
    expect(renderSelectedAgentDetailsMock).toHaveBeenCalledTimes(1);

    const agentViewClearCommand = commands.get("agent-view-clear");
    if (!agentViewClearCommand) {
      throw new Error("Expected agent-view-clear command");
    }
    await agentViewClearCommand.handler("", { ui: { notify: notifyMock } });
    expect(clearSelectedAgentDetailsMock).toHaveBeenCalledTimes(1);

    const agentViewShortcut = shortcuts.get("ctrl+j");
    if (!agentViewShortcut) {
      throw new Error("Expected ctrl+j shortcut");
    }
    await agentViewShortcut.handler({
      ui: { notify: notifyMock, select: vi.fn(async () => "agent-1 · Explore · running") },
    });
    expect(renderSelectedAgentDetailsMock).toHaveBeenCalledTimes(2);

    const beforeAgentStartHandler = handlers.get("before_agent_start");
    if (!beforeAgentStartHandler) {
      throw new Error("Expected before_agent_start handler");
    }
    const beforeAgentStartResult = (await beforeAgentStartHandler({ systemPrompt: "Base prompt" })) as {
      systemPrompt: string;
    };
    expect(beforeAgentStartResult).toEqual({
      systemPrompt: expect.stringContaining("You can delegate work to sub-agents using the Agent tool."),
    });
    expect(beforeAgentStartResult.systemPrompt).toContain("Do not use Agent when:");
    expect(beforeAgentStartResult.systemPrompt).toContain(
      "Once you delegate work, do not duplicate the same exploration or edits yourself.",
    );

    const sessionShutdownHandler = handlers.get("session_shutdown");
    if (!sessionShutdownHandler) {
      throw new Error("Expected session_shutdown handler");
    }
    managerMock.list.mockReturnValue([{ id: "agent-1", agentName: "Explore", status: "running" }]);
    await sessionShutdownHandler({});
    expect(disposeAgentProgressUiMock).toHaveBeenCalledTimes(1);
    expect(managerMock.shutdown).toHaveBeenCalledTimes(1);
  });
});
