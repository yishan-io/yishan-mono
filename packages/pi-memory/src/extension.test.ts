import { describe, expect, it, vi } from "vitest";

const { buildMock, registerMemoryToolsMock } = vi.hoisted(() => ({
  buildMock: vi.fn<() => string | null>(() => "injected memory context"),
  registerMemoryToolsMock: vi.fn(),
}));

vi.mock("./tools/registerMemoryTools", () => ({
  registerMemoryTools: registerMemoryToolsMock,
}));

vi.mock("./context/buildInjectedMemoryContext", () => ({
  createInjectedMemoryContextBuilder: vi.fn(() => ({ build: buildMock })),
}));

import { createPiMemoryExtension } from "./extension";

describe("createPiMemoryExtension", () => {
  it("registers tools and injects memory context once per session", async () => {
    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    const pi = {
      on(name: string, handler: (event: unknown, ctx?: unknown) => unknown) {
        handlers.set(name, handler);
      },
      registerTool: vi.fn(),
    };

    createPiMemoryExtension(pi as never);

    expect(registerMemoryToolsMock).toHaveBeenCalledTimes(1);
    const handler = handlers.get("before_agent_start");
    if (!handler) {
      throw new Error("Expected before_agent_start handler");
    }

    const sessionStartHandler = handlers.get("session_start");
    if (!sessionStartHandler) {
      throw new Error("Expected session_start handler");
    }
    await sessionStartHandler({}, { cwd: "/tmp/project" });

    const result = await handler({ prompt: "Inspect auth", systemPrompt: "base" }, { cwd: "/tmp/project" });
    expect(result).toEqual({
      message: {
        customType: "pi-memory-context",
        content: "injected memory context",
        display: false,
      },
    });

    await expect(
      handler({ prompt: "Inspect auth", systemPrompt: "base" }, { cwd: "/tmp/project" }),
    ).resolves.toBeUndefined();
  });

  it("skips injection when no memory context is available", async () => {
    buildMock.mockReturnValueOnce(null);

    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    const pi = {
      on(name: string, handler: (event: unknown, ctx?: unknown) => unknown) {
        handlers.set(name, handler);
      },
      registerTool: vi.fn(),
    };

    createPiMemoryExtension(pi as never);
    const handler = handlers.get("before_agent_start");
    if (!handler) {
      throw new Error("Expected before_agent_start handler");
    }

    await expect(
      handler({ prompt: "Inspect auth", systemPrompt: "base" }, { cwd: "/tmp/project" }),
    ).resolves.toBeUndefined();
  });
});
