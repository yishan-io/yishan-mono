import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAgentSessionFromServicesMock, createAgentSessionServicesMock, inMemorySessionManagerMock } = vi.hoisted(
  () => ({
    createAgentSessionFromServicesMock: vi.fn(),
    createAgentSessionServicesMock: vi.fn(),
    inMemorySessionManagerMock: vi.fn(),
  }),
);

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: {
    inMemory: inMemorySessionManagerMock,
  },
  createAgentSessionServices: createAgentSessionServicesMock,
  createAgentSessionFromServices: createAgentSessionFromServicesMock,
}));

import { createChildAgentSession } from "./sessionFactory";

describe("createChildAgentSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inMemorySessionManagerMock.mockReturnValue({ kind: "session-manager" });
    createAgentSessionServicesMock.mockResolvedValue({
      modelRegistry: {
        getAll: () => [{ id: "claude-haiku-4-5" }],
      },
    });
    createAgentSessionFromServicesMock.mockResolvedValue({
      session: { kind: "session" },
    });
  });

  it("creates an isolated in-memory child session with extension loading disabled", async () => {
    const result = await createChildAgentSession({
      cwd: "/tmp/project",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "claude-haiku-4-5",
        thinking: "low",
        tools: ["read", "grep"],
        source: "builtin",
      },
    });

    expect(createAgentSessionServicesMock).toHaveBeenCalledWith({
      cwd: "/tmp/project",
      resourceLoaderOptions: {
        noExtensions: true,
        noPromptTemplates: true,
        noThemes: true,
        appendSystemPrompt: ["Explore prompt"],
      },
    });
    expect(inMemorySessionManagerMock).toHaveBeenCalledWith("/tmp/project");
    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith({
      services: expect.objectContaining({ modelRegistry: expect.any(Object) }),
      sessionManager: { kind: "session-manager" },
      model: { id: "claude-haiku-4-5" },
      thinkingLevel: "low",
      tools: ["read", "grep"],
    });
    expect(result).toEqual({
      session: { kind: "session" },
      services: expect.objectContaining({ modelRegistry: expect.any(Object) }),
    });
  });

  it("omits the model when no explicit model is configured", async () => {
    await createChildAgentSession({
      cwd: "/tmp/project",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        thinking: "low",
        tools: ["read", "grep"],
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith({
      services: expect.objectContaining({ modelRegistry: expect.any(Object) }),
      sessionManager: { kind: "session-manager" },
      model: undefined,
      thinkingLevel: "low",
      tools: ["read", "grep"],
    });
  });

  it("throws when the configured model cannot be resolved", async () => {
    createAgentSessionServicesMock.mockResolvedValue({
      modelRegistry: {
        getAll: () => [],
      },
    });

    await expect(
      createChildAgentSession({
        cwd: "/tmp/project",
        agentDefinition: {
          name: "Explore",
          description: "Search the codebase",
          systemPrompt: "Explore prompt",
          model: "unknown-model",
          source: "builtin",
        },
      }),
    ).rejects.toThrow("Unknown model: unknown-model");
  });

  it("throws when an unqualified model id matches multiple providers", async () => {
    createAgentSessionServicesMock.mockResolvedValue({
      modelRegistry: {
        getAll: () => [{ id: "claude-sonnet" }, { id: "claude-sonnet" }],
      },
    });

    await expect(
      createChildAgentSession({
        cwd: "/tmp/project",
        agentDefinition: {
          name: "Explore",
          description: "Search the codebase",
          systemPrompt: "Explore prompt",
          model: "claude-sonnet",
          source: "builtin",
        },
      }),
    ).rejects.toThrow("Ambiguous model without provider prefix: claude-sonnet");
  });
});
