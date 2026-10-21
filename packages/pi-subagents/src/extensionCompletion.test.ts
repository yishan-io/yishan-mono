import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { AgentTerminalEvent } from "./delegation/types";
import type { CompletionOwner } from "./delivery/completionOwner";

const mocks = vi.hoisted(() => ({
  commands: vi.fn(),
  tool: vi.fn(),
  managers: [] as Array<{
    terminal?: (event: AgentTerminalEvent) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("./commands/registerAgentCommands", () => ({ registerAgentCommands: mocks.commands }));
vi.mock("./tools/agentTool", () => ({ registerAgentTool: mocks.tool }));
vi.mock("./ui/agentProgress", () => ({
  bindAgentProgressUi: () => vi.fn(),
  clearAgentProgress: vi.fn(),
  renderPendingDelegation: vi.fn(),
}));
vi.mock("./delegation", () => ({
  AgentManager: class {
    terminal?: (event: AgentTerminalEvent) => void;
    unsubscribe = vi.fn();
    shutdown = vi.fn(async () => {});
    constructor() {
      mocks.managers.push(this);
    }
    list() {
      return [];
    }
    subscribeTerminal(listener: (event: AgentTerminalEvent) => void) {
      this.terminal = listener;
      return this.unsubscribe;
    }
  },
}));
import { createPiSubagentsExtension } from "./extension";

function event(owner: CompletionOwner): AgentTerminalEvent {
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
  return {
    parent: owner.parent,
    result: { agentId: "instant", agentName: "Explore", status: "completed", responseText: "done", usage },
    record: {
      id: "instant",
      agentName: "Explore",
      prompt: "go",
      mode: "background",
      status: "completed",
      createdAt: 0,
      usage,
    },
  };
}
function harness() {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
  const sendMessage = vi.fn();
  const pi = {
    on: (name: string, handler: never) => handlers.set(name, handler),
    registerCommand: vi.fn(),
    registerShortcut: vi.fn(),
    sendMessage,
  };
  createPiSubagentsExtension(pi as unknown as ExtensionAPI);
  const ctx = (id: string) => ({
    sessionManager: { getSessionId: () => id },
    ui: { addAutocompleteProvider: vi.fn(), notify: vi.fn() },
  });
  const emit = async (name: string, context: unknown) => handlers.get(name)?.({}, context);
  const binding = () => {
    const args = mocks.tool.mock.calls.at(-1);
    return { manager: args?.[2] as (typeof mocks.managers)[number], owner: args?.[3] as CompletionOwner };
  };
  return { emit, ctx, binding, sendMessage };
}
describe("completion extension lifetime", () => {
  it("captures actual session_start context, rebinds same owner without replay, and sends regardless of parent idle state", async () => {
    const h = harness();
    const a = h.ctx("A");
    await h.emit("session_start", a);
    const { manager, owner } = h.binding();
    expect(owner.parent.sessionId).toBe("A");
    owner.enroll("instant");
    manager.terminal?.(event(owner));
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
    await h.emit("session_start", a);
    expect(h.binding().owner).toBe(owner);
    expect(h.binding().manager).toBe(manager);
    manager.terminal?.(event(owner));
    owner.enroll("instant");
    manager.terminal?.(event(owner));
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
    await h.emit("session_shutdown", a);
    expect(owner.isClosed).toBe(true);
  });
  it("closes before teardown and isolates A -> B -> A, stale terminal callbacks and late shutdown", async () => {
    const h = harness();
    const a = h.ctx("A");
    await h.emit("session_start", a);
    const first = h.binding();
    first.owner.enroll("instant");
    const staleTerminal = first.manager.terminal;
    let release: (() => void) | undefined;
    first.manager.shutdown.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const shutdown = h.emit("session_shutdown", a);
    expect(first.owner.isClosed).toBe(true);
    expect(first.manager.unsubscribe).toHaveBeenCalled();
    await h.emit("session_start", h.ctx("B"));
    const second = h.binding();
    await h.emit("session_start", h.ctx("A"));
    const third = h.binding();
    expect(second.owner.isClosed).toBe(true);
    expect(third.manager).not.toBe(first.manager);
    expect(third.owner.parent.lifetime).not.toBe(first.owner.parent.lifetime);
    staleTerminal?.(event(first.owner));
    third.owner.enroll("instant");
    third.manager.terminal?.(event(first.owner));
    expect(h.sendMessage).not.toHaveBeenCalled();
    release?.();
    await shutdown;
    expect(third.owner.isClosed).toBe(false);
    third.manager.terminal?.(event(third.owner));
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
    await h.emit("session_shutdown", h.ctx("A"));
  });
});
