import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  type AgentSession,
  type AgentSessionServices,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

import { type ChildSessionOptions, invokeAgentObserver } from "./types";

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
export async function createDelegatedSession(options: ChildSessionOptions): Promise<CreateChildAgentSessionResult> {
  const extensionFactories = (await options.resolveExtensions?.()) ?? [];
  const services = await createAgentSessionServices({
    cwd: options.cwd,
    agentDir: getAgentDir(),
    resourceLoaderOptions: {
      noExtensions: true,
      noPromptTemplates: true,
      noThemes: true,
      extensionFactories,
      appendSystemPrompt: [options.systemPrompt],
    },
  });
  // A fresh manager resolves Pi's cwd default directory without writing a transcript.
  const defaultSessionDir = SessionManager.create(options.cwd).getSessionDir();
  const sessionManager = SessionManager.create(options.cwd, join(defaultSessionDir, "subagents"), {
    parentSession: options.parentSessionPath,
  });
  const resolvedModel = resolveModelSpecifier(services, options.model, options.parentModel);
  const explicitThinking = options.thinking;
  const thinkingLevel = resolvedModel.didFallback ? (options.parentThinking ?? explicitThinking) : explicitThinking;
  const sessionId = sessionManager.getSessionId();
  const sessionPath = sessionManager.getSessionFile();

  invokeAgentObserver(() =>
    options.onSessionCreated?.(sessionManager, {
      agentId: options.agentId,
      agentName: options.agentName,
      mode: options.mode,
      sessionId,
      sessionPath,
    }),
  );

  const createdSession = await createAgentSessionFromServices({
    services,
    sessionManager,
    model: resolvedModel.model,
    thinkingLevel,
    tools: options.tools,
  });

  return {
    session: createdSession.session,
    services,
    sessionId,
    sessionPath,
  };
}

type SessionModel = NonNullable<Parameters<typeof createAgentSessionFromServices>[0]["model"]>;

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

  const { modelRuntime } = services;
  let resolvedModel: SessionModel | undefined;

  const providerSplitIndex = modelSpecifier.indexOf("/");
  if (providerSplitIndex >= 0) {
    const provider = modelSpecifier.slice(0, providerSplitIndex);
    const modelId = modelSpecifier.slice(providerSplitIndex + 1);
    resolvedModel = modelRuntime.getModel(provider, modelId);
    if (!resolvedModel) {
      throw new Error(`Unknown model: ${modelSpecifier}`);
    }
  } else {
    const matchingModels = modelRuntime.getModels().filter((candidateModel) => candidateModel.id === modelSpecifier);
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
  if (resolvedModel && modelRuntime.hasConfiguredAuth(resolvedModel.provider)) {
    return { model: resolvedModel, didFallback: false };
  }

  // Fall back to the parent's already-resolved model when it still has configured auth.
  if (parentModel && modelRuntime.hasConfiguredAuth(parentModel.provider)) {
    return { model: parentModel, didFallback: true };
  }

  // Otherwise fall back to the saved settings default, then the first available model.
  return { model: resolveSettingsDefaultModel(services), didFallback: true };
}

function resolveSettingsDefaultModel({
  modelRuntime,
  settingsManager,
}: AgentSessionServices): SessionModel | undefined {
  const defaultProvider = settingsManager.getDefaultProvider();
  const defaultModelId = settingsManager.getDefaultModel();
  if (defaultProvider && defaultModelId) {
    const defaultModel = modelRuntime.getModel(defaultProvider, defaultModelId);
    if (defaultModel && modelRuntime.hasConfiguredAuth(defaultModel.provider)) {
      return defaultModel;
    }
  }

  return modelRuntime.getAvailableSnapshot()[0];
}
