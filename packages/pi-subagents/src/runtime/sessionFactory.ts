import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  type AgentSession,
  type AgentSessionServices,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";

import type { AgentDefinition, AgentRunMode } from "../agents/types";
import { resolveChildExtensionFactories } from "./childExtensions";
import type { ChildSessionDescriptor, ParentSessionReference } from "./sessionRelationship";
import { recordChildSessionMetadata } from "./sessionRelationship";

/** Input required to create one isolated child agent session. */
export interface CreateChildAgentSessionOptions {
  agentId: string;
  agentName: string;
  cwd: string;
  mode: AgentRunMode;
  parentSession?: ParentSessionReference;
  childSessionDescriptor?: ChildSessionDescriptor;
  agentDefinition: AgentDefinition;
  model?: string;
  /** Parent session's already-resolved model, used as an auth-checked fallback. */
  parentModel?: SessionModel;
  /** Parent session's current thinking level, used as a fallback when model resolution falls back. */
  parentThinking?: ThinkingLevel;
  thinking?: ThinkingLevel;
  tools?: string[];
}

/** Result of creating one isolated child agent session. */
export interface CreateChildAgentSessionResult {
  session: AgentSession;
  services: AgentSessionServices;
  sessionId: string;
  sessionPath?: string;
}

/**
 * Creates one isolated persisted child agent session using Pi SDK session APIs.
 */
export async function createChildAgentSession(
  options: CreateChildAgentSessionOptions,
): Promise<CreateChildAgentSessionResult> {
  const extensionFactories = await resolveChildExtensionFactories();
  const services = await createAgentSessionServices({
    cwd: options.cwd,
    resourceLoaderOptions: {
      noExtensions: true,
      noPromptTemplates: true,
      noThemes: true,
      extensionFactories,
      appendSystemPrompt: [options.agentDefinition.systemPrompt],
    },
  });
  const sessionManager = SessionManager.create(options.cwd, undefined, {
    parentSession: options.parentSession?.sessionPath,
  });
  const resolvedModel = resolveModelSpecifier(
    services,
    options.model ?? options.agentDefinition.model,
    options.parentModel,
  );
  const explicitThinking = options.thinking ?? options.agentDefinition.thinking;
  const thinkingLevel = resolvedModel.didFallback ? (options.parentThinking ?? explicitThinking) : explicitThinking;
  const sessionId = sessionManager.getSessionId();
  const sessionPath = sessionManager.getSessionFile();

  recordChildSessionMetadata(sessionManager, {
    version: 1,
    sessionKind: "subagent",
    agentId: options.agentId,
    agentName: options.agentName,
    mode: options.mode,
    title: options.childSessionDescriptor?.title ?? options.agentName,
    summary: options.childSessionDescriptor?.summary,
    parentSessionId: options.parentSession?.sessionId,
    parentSessionPath: options.parentSession?.sessionPath,
    childSessionId: sessionId,
    childSessionPath: sessionPath,
  });

  const createdSession = await createAgentSessionFromServices({
    services,
    sessionManager,
    model: resolvedModel.model,
    thinkingLevel,
    tools: options.tools ?? options.agentDefinition.tools,
  });

  return {
    session: createdSession.session,
    services,
    sessionId,
    sessionPath,
  };
}

const UNSUPPORTED_MODEL_API_ERROR =
  "Unsupported AgentSessionServices model API: expected services.modelRuntime.getModel/getModels or services.modelRegistry.find/getAll";

type SessionModel = NonNullable<Parameters<typeof createAgentSessionFromServices>[0]["model"]>;

type CurrentModelRuntimeShape = {
  getModel: (provider: string, modelId: string) => SessionModel | undefined;
  getModels: () => readonly SessionModel[];
  hasConfiguredAuth: (providerId: string) => boolean;
  getAvailableSnapshot: () => readonly SessionModel[];
};

type LegacyModelRegistryShape = {
  find: (provider: string, modelId: string) => SessionModel | undefined;
  getAll: () => readonly SessionModel[];
  hasConfiguredAuth: (model: SessionModel) => boolean;
  getAvailable: () => readonly SessionModel[];
};

type CompatibleModelAccessor = {
  getModel: (provider: string, modelId: string) => SessionModel | undefined;
  getModels: () => readonly SessionModel[];
  hasConfiguredAuth: (model: SessionModel) => boolean;
  getAvailable: () => readonly SessionModel[];
};

interface ResolvedModelSpecifier {
  model: SessionModel | undefined;
  /** True when the explicit specifier was rejected for lacking configured auth and a fallback was used. */
  didFallback: boolean;
}

function resolveModelSpecifier(
  services: AgentSessionServices,
  modelSpecifier: string | undefined,
  parentModel: SessionModel | undefined,
): ResolvedModelSpecifier {
  if (!modelSpecifier) {
    return { model: undefined, didFallback: false };
  }

  const modelAccessor = resolveCompatibleModelAccessor(services);
  let resolvedModel: SessionModel | undefined;

  const providerSplitIndex = modelSpecifier.indexOf("/");
  if (providerSplitIndex >= 0) {
    const provider = modelSpecifier.slice(0, providerSplitIndex);
    const modelId = modelSpecifier.slice(providerSplitIndex + 1);
    resolvedModel = modelAccessor.getModel(provider, modelId);
    if (!resolvedModel) {
      throw new Error(`Unknown model: ${modelSpecifier}`);
    }
  } else {
    const matchingModels = modelAccessor.getModels().filter((candidateModel) => candidateModel.id === modelSpecifier);
    if (matchingModels.length === 0) {
      throw new Error(`Unknown model: ${modelSpecifier}`);
    }

    if (matchingModels.length > 1) {
      throw new Error(`Ambiguous model without provider prefix: ${modelSpecifier}`);
    }

    resolvedModel = matchingModels[0];
  }

  // Reject an explicitly-resolved model whose provider has no configured auth and
  // fall back instead of running the child against a provider with no API key.
  if (resolvedModel && modelAccessor.hasConfiguredAuth(resolvedModel)) {
    return { model: resolvedModel, didFallback: false };
  }

  // Fall back to the parent's already-resolved model when it still has configured auth.
  if (parentModel && modelAccessor.hasConfiguredAuth(parentModel)) {
    return { model: parentModel, didFallback: true };
  }

  // Otherwise fall back to the saved settings default, then the first available model.
  return { model: resolveSettingsDefaultModel(services, modelAccessor), didFallback: true };
}

interface SettingsManagerLike {
  getDefaultProvider(): string | undefined;
  getDefaultModel(): string | undefined;
}

function resolveSettingsDefaultModel(
  services: AgentSessionServices,
  modelAccessor: CompatibleModelAccessor,
): SessionModel | undefined {
  const settingsManager = (services as { settingsManager?: SettingsManagerLike }).settingsManager;
  const defaultProvider = settingsManager?.getDefaultProvider();
  const defaultModelId = settingsManager?.getDefaultModel();
  if (defaultProvider && defaultModelId) {
    const defaultModel = modelAccessor.getModel(defaultProvider, defaultModelId);
    if (defaultModel && modelAccessor.hasConfiguredAuth(defaultModel)) {
      return defaultModel;
    }
  }

  return modelAccessor.getAvailable()[0];
}

function resolveCompatibleModelAccessor(services: AgentSessionServices): CompatibleModelAccessor {
  const compatibilityServices = services as AgentSessionServices & {
    modelRuntime?: unknown;
    modelRegistry?: unknown;
  };

  if (isCurrentModelRuntimeShape(compatibilityServices.modelRuntime)) {
    const modelRuntime = compatibilityServices.modelRuntime;
    return {
      getModel: (provider, modelId) => modelRuntime.getModel(provider, modelId),
      getModels: () => modelRuntime.getModels(),
      hasConfiguredAuth: (model) => modelRuntime.hasConfiguredAuth(model.provider),
      getAvailable: () => modelRuntime.getAvailableSnapshot(),
    };
  }

  if (isLegacyModelRegistryShape(compatibilityServices.modelRegistry)) {
    const modelRegistry = compatibilityServices.modelRegistry;
    return {
      getModel: (provider, modelId) => modelRegistry.find(provider, modelId),
      getModels: () => modelRegistry.getAll(),
      hasConfiguredAuth: (model) => modelRegistry.hasConfiguredAuth(model),
      getAvailable: () => modelRegistry.getAvailable(),
    };
  }

  throw new Error(UNSUPPORTED_MODEL_API_ERROR);
}

function isCurrentModelRuntimeShape(value: unknown): value is CurrentModelRuntimeShape {
  return (
    hasFunction(value, "getModel") &&
    hasFunction(value, "getModels") &&
    hasFunction(value, "hasConfiguredAuth") &&
    hasFunction(value, "getAvailableSnapshot")
  );
}

function isLegacyModelRegistryShape(value: unknown): value is LegacyModelRegistryShape {
  return (
    hasFunction(value, "find") &&
    hasFunction(value, "getAll") &&
    hasFunction(value, "hasConfiguredAuth") &&
    hasFunction(value, "getAvailable")
  );
}

function hasFunction(value: unknown, propertyName: string): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return typeof (value as Record<string, unknown>)[propertyName] === "function";
}
