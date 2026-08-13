import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Api, Model } from "@earendil-works/pi-ai";

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

vi.mock("@yishan-io/pi-lsp", () => ({ createPiLspExtension: () => {} }));

import { createChildAgentSession } from "./sessionFactory";

function createModel(provider: string, id: string, source?: string): Model<Api> {
  return {
    provider,
    id,
    ...(source ? { source } : {}),
  } as Model<Api>;
}

function createConfiguredProviderSet(models: ReturnType<typeof createModel>[], configuredProviders?: string[]) {
  return new Set(configuredProviders ?? models.map((model) => model.provider));
}

function createModelRuntime(models: ReturnType<typeof createModel>[], configuredProviders?: string[]) {
  const configured = createConfiguredProviderSet(models, configuredProviders);
  return {
    getModel: (provider: string, modelId: string) =>
      models.find((candidateModel) => candidateModel.provider === provider && candidateModel.id === modelId),
    getModels: () => models,
    hasConfiguredAuth: (providerId: string) => configured.has(providerId),
    getAvailableSnapshot: () => models.filter((model) => configured.has(model.provider)),
  };
}

function createLegacyModelRegistry(models: ReturnType<typeof createModel>[], configuredProviders?: string[]) {
  const configured = createConfiguredProviderSet(models, configuredProviders);
  return {
    find: (provider: string, modelId: string) =>
      models.find((candidateModel) => candidateModel.provider === provider && candidateModel.id === modelId),
    getAll: () => models,
    hasConfiguredAuth: (model: { provider: string }) => configured.has(model.provider),
    getAvailable: () => models.filter((model) => configured.has(model.provider)),
  };
}

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
      modelRuntime: createModelRuntime([createModel("anthropic", "claude-haiku-4-5")]),
    });
    createAgentSessionFromServicesMock.mockResolvedValue({
      session: { kind: "session" },
    });
  });

  it("creates a persisted child session in the shared session store with parent metadata", async () => {
    const resolvedModel = createModel("anthropic", "claude-haiku-4-5");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([resolvedModel]),
    });

    const result = await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "background",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "anthropic/claude-haiku-4-5",
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
        extensionFactories: [expect.any(Function)],
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
      services: expect.objectContaining({ modelRuntime: expect.any(Object) }),
      sessionManager: expect.objectContaining({ kind: "session-manager" }),
      model: resolvedModel,
      thinkingLevel: "low",
      tools: ["read", "grep"],
    });
    expect(result).toEqual({
      session: { kind: "session" },
      services: expect.objectContaining({ modelRuntime: expect.any(Object) }),
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
      services: expect.any(Object),
      sessionManager: expect.objectContaining({ kind: "session-manager" }),
      model: undefined,
      thinkingLevel: "low",
      tools: ["read", "grep"],
    });
  });

  it("resolves unqualified model ids via modelRuntime.getModels", async () => {
    const resolvedModel = createModel("anthropic", "claude-haiku-4-5");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([resolvedModel]),
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "claude-haiku-4-5",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: resolvedModel,
      }),
    );
  });

  it("falls back to legacy modelRegistry for provider-qualified model resolution", async () => {
    const resolvedModel = createModel("anthropic", "claude-haiku-4-5");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRegistry: createLegacyModelRegistry([resolvedModel]),
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "anthropic/claude-haiku-4-5",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: resolvedModel,
      }),
    );
  });

  it("prefers modelRuntime when both model APIs are present", async () => {
    const runtimeModel = createModel("anthropic", "claude-haiku-4-5", "runtime");
    const legacyModel = createModel("anthropic", "claude-haiku-4-5", "legacy");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([runtimeModel]),
      modelRegistry: createLegacyModelRegistry([legacyModel]),
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "anthropic/claude-haiku-4-5",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: runtimeModel,
      }),
    );
  });

  it("throws when the configured model cannot be resolved", async () => {
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([]),
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
      modelRuntime: createModelRuntime([
        createModel("anthropic", "claude-sonnet"),
        createModel("openai", "claude-sonnet"),
      ]),
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

  it("throws an actionable error when no compatible model API is available", async () => {
    createAgentSessionServicesMock.mockResolvedValue({});

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
          model: "anthropic/claude-haiku-4-5",
          source: "builtin",
        },
      }),
    ).rejects.toThrow(
      "Unsupported AgentSessionServices model API: expected services.modelRuntime.getModel/getModels or services.modelRegistry.find/getAll",
    );
  });

  it("rejects a provider-prefixed model with no configured auth and falls back to the parent model", async () => {
    const unconfiguredModel = createModel("amazon-bedrock", "anthropic.claude-opus-4-6-v1");
    const otherAvailableModel = createModel("openai", "gpt-5.5");
    const parentModel = createModel("anthropic", "claude-haiku-4-5");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([unconfiguredModel, otherAvailableModel, parentModel], ["openai", "anthropic"]),
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      parentModel,
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "amazon-bedrock/anthropic.claude-opus-4-6-v1",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(expect.objectContaining({ model: parentModel }));
  });

  it("rejects a bare-id model resolving to an unconfigured provider and falls back to the settings default", async () => {
    const unconfiguredModel = createModel("amazon-bedrock", "anthropic.claude-opus-4-6-v1");
    const defaultModel = createModel("anthropic", "claude-opus-4-6-v1");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([unconfiguredModel, defaultModel], ["anthropic"]),
      settingsManager: {
        getDefaultProvider: () => "anthropic",
        getDefaultModel: () => "claude-opus-4-6-v1",
      },
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "anthropic.claude-opus-4-6-v1",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(expect.objectContaining({ model: defaultModel }));
  });

  it("falls back to the first available model when neither the parent nor settings default has auth", async () => {
    const unconfiguredModel = createModel("amazon-bedrock", "anthropic.claude-opus-4-6-v1");
    const availableModel = createModel("anthropic", "claude-opus-4-6-v1");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([unconfiguredModel, availableModel], ["anthropic"]),
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "amazon-bedrock/anthropic.claude-opus-4-6-v1",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(expect.objectContaining({ model: availableModel }));
  });

  it("falls back using the legacy modelRegistry shape when the provider has no configured auth", async () => {
    const unconfiguredModel = createModel("amazon-bedrock", "anthropic.claude-opus-4-6-v1");
    const availableModel = createModel("anthropic", "claude-haiku-4-5");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRegistry: createLegacyModelRegistry([unconfiguredModel, availableModel], ["anthropic"]),
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "amazon-bedrock/anthropic.claude-opus-4-6-v1",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(expect.objectContaining({ model: availableModel }));
  });

  it("falls back to the parent thinking level when model resolution falls back", async () => {
    const unconfiguredModel = createModel("amazon-bedrock", "anthropic.claude-opus-4-6-v1");
    const parentModel = createModel("anthropic", "claude-haiku-4-5");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([unconfiguredModel, parentModel], ["anthropic"]),
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      parentModel,
      parentThinking: "high",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "amazon-bedrock/anthropic.claude-opus-4-6-v1",
        thinking: "low",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: parentModel,
        thinkingLevel: "high",
      }),
    );
  });

  it("keeps the agent's thinking level when model resolution succeeds", async () => {
    const resolvedModel = createModel("anthropic", "claude-haiku-4-5");
    createAgentSessionServicesMock.mockResolvedValue({
      modelRuntime: createModelRuntime([resolvedModel]),
    });

    await createChildAgentSession({
      cwd: "/tmp/project",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      parentThinking: "high",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        model: "anthropic/claude-haiku-4-5",
        thinking: "low",
        source: "builtin",
      },
    });

    expect(createAgentSessionFromServicesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: resolvedModel,
        thinkingLevel: "low",
      }),
    );
  });
});
