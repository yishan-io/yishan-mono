import type {
  PiProviderAuthMethod,
  PiProviderAuthMethodKind,
  PiRuntimeModelRecord,
  PiRuntimeProviderRecord,
} from "../../../main/piRuntime/piRuntimeTypes";
import type { ModelOption } from "../../components/ModelAutocomplete";

export type AgentProviderStatusKind =
  | "connectedOauth"
  | "connectedStored"
  | "connectedEnv"
  | "connectedExternal"
  | "externalSetupRequired";

export type AgentProviderPrimaryAction =
  | { kind: "authenticate"; method: PiProviderAuthMethodKind }
  | { kind: "manageOauth" }
  | { kind: "manageApiKey" };

export type AgentProviderConfigEntry = {
  provider: PiRuntimeProviderRecord;
  method: PiProviderAuthMethod;
};

const PROVIDER_METHOD_ORDER: Record<PiProviderAuthMethod["kind"], number> = {
  oauth: 0,
  api_key: 1,
  external: 2,
};

/** Builds one flat provider configuration list ordered by Pi-derived method type. */
export function buildAgentProviderConfigEntries(
  providers: readonly PiRuntimeProviderRecord[],
): AgentProviderConfigEntry[] {
  const entries: AgentProviderConfigEntry[] = [];
  for (const provider of providers) {
    const methods: readonly PiProviderAuthMethod[] =
      provider.authMethods.length > 0 ? provider.authMethods : [{ kind: "external", label: provider.name }];
    for (const method of methods) {
      entries.push({ provider, method });
    }
  }
  return entries.sort((left, right) => {
    const methodDifference = PROVIDER_METHOD_ORDER[left.method.kind] - PROVIDER_METHOD_ORDER[right.method.kind];
    const configuredDifference =
      Number(isAgentProviderConfigEntryConfigured(right)) - Number(isAgentProviderConfigEntryConfigured(left));
    return methodDifference || configuredDifference || left.method.label.localeCompare(right.method.label);
  });
}

/** Returns whether the provider's active credential source configures this specific method. */
export function isAgentProviderConfigEntryConfigured(entry: AgentProviderConfigEntry): boolean {
  switch (entry.provider.authSource) {
    case "oauth":
      return entry.method.kind === "oauth";
    case "auth_file":
      return entry.method.kind === "api_key";
    case "env":
    case "external":
      return entry.method.kind !== "oauth";
    default:
      return false;
  }
}

/** Maps one method entry to the status shown for that configuration option. */
export function getAgentProviderConfigEntryStatusKind(
  entry: AgentProviderConfigEntry,
): AgentProviderStatusKind | undefined {
  if (isAgentProviderConfigEntryConfigured(entry)) {
    return getAgentProviderStatusKind(entry.provider);
  }
  return entry.method.kind === "external" ? "externalSetupRequired" : undefined;
}

/** Resolves the safe action for one method entry rather than for the provider as a whole. */
export function getAgentProviderConfigEntryAction(
  entry: AgentProviderConfigEntry,
): AgentProviderPrimaryAction | undefined {
  if (entry.method.kind === "external") {
    return undefined;
  }
  if (isAgentProviderConfigEntryConfigured(entry)) {
    if (entry.provider.authSource === "env" || entry.provider.authSource === "external") {
      return undefined;
    }
    return entry.method.kind === "oauth" ? { kind: "manageOauth" } : { kind: "manageApiKey" };
  }
  return { kind: "authenticate", method: entry.method.kind };
}

/** Maps one provider auth source into one UI status kind. */
export function getAgentProviderStatusKind(provider: PiRuntimeProviderRecord): AgentProviderStatusKind | undefined {
  switch (provider.authSource) {
    case "oauth":
      return "connectedOauth";
    case "auth_file":
      return "connectedStored";
    case "env":
      return "connectedEnv";
    case "external":
      return "connectedExternal";
    default:
      return provider.authMethods.some((method) => method.kind === "external") ? "externalSetupRequired" : undefined;
  }
}

/** Flags configured providers whose refreshed model registry has no usable model. */
export function isAgentProviderConfiguredButUnavailable(provider: PiRuntimeProviderRecord): boolean {
  return provider.hasAuth && !provider.available;
}

/** Builds one sorted provider list from providers that currently expose at least one available model. */
export function buildAvailablePiProviderOptions(models: readonly PiRuntimeModelRecord[]): ModelOption[] {
  const providersById = new Map<string, ModelOption>();
  for (const model of models) {
    if (model.available && !providersById.has(model.providerId)) {
      providersById.set(model.providerId, { id: model.providerId, name: model.providerName });
    }
  }
  return [...providersById.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** Builds one sorted model list for the selected provider from currently available models only. */
export function buildAvailablePiModelOptionsForProvider(
  models: readonly PiRuntimeModelRecord[],
  providerId: string | undefined,
): ModelOption[] {
  if (!providerId) {
    return [];
  }
  return models
    .filter((model) => model.available && model.providerId === providerId)
    .map<ModelOption>((model) => ({
      id: `${model.providerId}/${model.modelId}`,
      name: model.label,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
