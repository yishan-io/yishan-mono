import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  type AgentSession,
  type AgentSessionServices,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";

import type { AgentDefinition, AgentRunMode } from "../agents/types";
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
  const services = await createAgentSessionServices({
    cwd: options.cwd,
    resourceLoaderOptions: {
      noExtensions: true,
      noPromptTemplates: true,
      noThemes: true,
      appendSystemPrompt: [options.agentDefinition.systemPrompt],
    },
  });
  const sessionManager = SessionManager.create(options.cwd, undefined, {
    parentSession: options.parentSession?.sessionPath,
  });
  const resolvedModel = resolveModelSpecifier(services, options.model ?? options.agentDefinition.model);
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
    model: resolvedModel,
    thinkingLevel: options.thinking ?? options.agentDefinition.thinking,
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
};

type LegacyModelRegistryShape = {
  find: (provider: string, modelId: string) => SessionModel | undefined;
  getAll: () => readonly SessionModel[];
};

type CompatibleModelAccessor = {
  getModel: (provider: string, modelId: string) => SessionModel | undefined;
  getModels: () => readonly SessionModel[];
};

function resolveModelSpecifier(services: AgentSessionServices, modelSpecifier?: string) {
  if (!modelSpecifier) {
    return undefined;
  }

  const modelAccessor = resolveCompatibleModelAccessor(services);
  const providerSplitIndex = modelSpecifier.indexOf("/");
  if (providerSplitIndex >= 0) {
    const provider = modelSpecifier.slice(0, providerSplitIndex);
    const modelId = modelSpecifier.slice(providerSplitIndex + 1);
    const resolvedModel = modelAccessor.getModel(provider, modelId);
    if (!resolvedModel) {
      throw new Error(`Unknown model: ${modelSpecifier}`);
    }

    return resolvedModel;
  }

  const matchingModels = modelAccessor.getModels().filter((candidateModel) => candidateModel.id === modelSpecifier);
  if (matchingModels.length === 0) {
    throw new Error(`Unknown model: ${modelSpecifier}`);
  }

  if (matchingModels.length > 1) {
    throw new Error(`Ambiguous model without provider prefix: ${modelSpecifier}`);
  }

  return matchingModels[0];
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
    };
  }

  if (isLegacyModelRegistryShape(compatibilityServices.modelRegistry)) {
    const modelRegistry = compatibilityServices.modelRegistry;
    return {
      getModel: (provider, modelId) => modelRegistry.find(provider, modelId),
      getModels: () => modelRegistry.getAll(),
    };
  }

  throw new Error(UNSUPPORTED_MODEL_API_ERROR);
}

function isCurrentModelRuntimeShape(value: unknown): value is CurrentModelRuntimeShape {
  return hasFunction(value, "getModel") && hasFunction(value, "getModels");
}

function isLegacyModelRegistryShape(value: unknown): value is LegacyModelRegistryShape {
  return hasFunction(value, "find") && hasFunction(value, "getAll");
}

function hasFunction(value: unknown, propertyName: string): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return typeof (value as Record<string, unknown>)[propertyName] === "function";
}
