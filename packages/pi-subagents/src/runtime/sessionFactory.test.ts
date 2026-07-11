import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAgentSessionFromServicesMock,
  createAgentSessionServicesMock,
  createSessionManagerMock,
  sessionManagerAppendCustomEntryMock,
} = vi.hoisted(() => ({
  createAgentSessionFromServicesMock: vi.fn(),
  createAgentSessionServicesMock: vi.fn(),
  createSessionManagerMock: vi.fn(),
  sessionManagerAppendCustomEntryMock: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: {
    create: createSessionManagerMock,
  },
  createAgentSessionServices: createAgentSessionServicesMock,
  createAgentSessionFromServices: createAgentSessionFromServicesMock,
}));

import { createChildAgentSession } from "./sessionFactory";

describe("createChildAgentSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionManagerAppendCustomEntryMock.mockReset();
    createSessionManagerMock.mockReturnValue({
      kind: "session-manager",
      getSessionId: () => "child-session-1",
      getSessionFile: () => "/tmp/shared-sessions/child-session-1.jsonl",
      appendCustomEntry: sessionManagerAppendCustomEntryMock,
    });
    createAgentSessionServicesMock.mockResolvedValue({
      modelRegistry: {
        getAll: () => [{ id: "claude-haiku-4-5" }],
      },
    });
    createAgentSessionFromServicesMock.mockResolvedValue({
      session: { kind: "session" },
    });
  });

  it("creates a persisted child session in the shared session store with parent metadata", async () => {
    const result = await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "background",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "claude-haiku-4-5",
        thinking: "low",
        tools: ["read", "grep"],
        source: "builtin",
      },
      parentSession: {
        sessionId: "parent-session-1",
        sessionPath: "/tmp/shared-sessions/parent-session-1.jsonl",
        cwd: "/tmp/project",
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
    expect(createSessionManagerMock).toHaveBeenCalledWith("/tmp/project", undefined, {
      parentSession: "/tmp/shared-sessions/parent-session-1.jsonl",
    });
    expect(sessionManagerAppendCustomEntryMock).toHaveBeenCalledWith(
      "pi-subagent-parent",
      expect.objectContaining({
        version: 1,
        agentId: "agent-1",
        agentName: "Explore",
        mode: "background",
        parentSessionId: "parent-session-1",
        parentSessionPath: "/tmp/shared-sessions/parent-session-1.jsonl",
        childSessionId: "child-session-1",
        childSessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
      }),
    );
    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith({
      services: expect.objectContaining({ modelRegistry: expect.any(Object) }),
      sessionManager: expect.objectContaining({ kind: "session-manager" }),
      model: { id: "claude-haiku-4-5" },
      thinkingLevel: "low",
      tools: ["read", "grep"],
    });
    expect(result).toEqual({
      session: { kind: "session" },
      services: expect.objectContaining({ modelRegistry: expect.any(Object) }),
      sessionId: "child-session-1",
      sessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
    });
  });

  it("omits the model when no explicit model is configured", async () => {
    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
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
      sessionManager: expect.objectContaining({ kind: "session-manager" }),
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
        agentId: "agent-1",
        agentName: "Explore",
        mode: "foreground",
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
        agentId: "agent-1",
        agentName: "Explore",
        mode: "foreground",
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
