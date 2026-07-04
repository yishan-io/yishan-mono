import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  type AgentSession,
  type AgentSessionServices,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";

import type { AgentDefinition } from "../agents/types";

/** Input required to create one isolated child agent session. */
export interface CreateChildAgentSessionOptions {
  cwd: string;
  agentDefinition: AgentDefinition;
  model?: string;
  thinking?: ThinkingLevel;
  tools?: string[];
}

/** Result of creating one isolated child agent session. */
export interface CreateChildAgentSessionResult {
  session: AgentSession;
  services: AgentSessionServices;
}

/**
 * Creates one isolated in-memory child agent session using Pi SDK session APIs.
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
  const sessionManager = SessionManager.inMemory(options.cwd);
  const resolvedModel = resolveModelSpecifier(services, options.model ?? options.agentDefinition.model);

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
  };
}

function resolveModelSpecifier(services: AgentSessionServices, modelSpecifier?: string) {
  if (!modelSpecifier) {
    return undefined;
  }

  const providerSplitIndex = modelSpecifier.indexOf("/");
  if (providerSplitIndex >= 0) {
    const provider = modelSpecifier.slice(0, providerSplitIndex);
    const modelId = modelSpecifier.slice(providerSplitIndex + 1);
    const resolvedModel = services.modelRegistry.find(provider, modelId);
    if (!resolvedModel) {
      throw new Error(`Unknown model: ${modelSpecifier}`);
    }

    return resolvedModel;
  }

  const matchingModels = services.modelRegistry
    .getAll()
    .filter((candidateModel) => candidateModel.id === modelSpecifier);
  if (matchingModels.length === 0) {
    throw new Error(`Unknown model: ${modelSpecifier}`);
  }

  if (matchingModels.length > 1) {
    throw new Error(`Ambiguous model without provider prefix: ${modelSpecifier}`);
  }

  return matchingModels[0];
}
