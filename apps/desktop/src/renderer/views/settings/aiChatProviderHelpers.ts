import type {
  PiProviderAuthMethod,
  PiProviderAuthMethodKind,
  PiProviderModelRecord,
  PiProviderRecord,
} from "../../../shared/contracts/piProviderConfig";
import type { ModelOption } from "../../components/ModelAutocomplete";

/** Status labels rendered for one provider authentication configuration entry. */
export type AiChatProviderStatusKind =
  | "connectedOauth"
  | "connectedStored"
  | "connectedEnv"
  | "connectedExternal"
  | "externalSetupRequired";

/** Safe user action available for one provider authentication entry. */
export type AiChatProviderPrimaryAction =
  | { kind: "authenticate"; method: PiProviderAuthMethodKind }
  | { kind: "manageOauth" }
  | { kind: "manageApiKey" };

/** One provider capability rendered as a row in the configuration card. */
export type AiChatProviderConfigEntry = {
  provider: PiProviderRecord;
  method: PiProviderAuthMethod;
};

const PROVIDER_METHOD_ORDER: Record<PiProviderAuthMethod["kind"], number> = {
  oauth: 0,
  api_key: 1,
  external: 2,
};

/** Builds one flat provider configuration list ordered by Pi-derived method type. */
export function buildAiChatProviderConfigEntries(providers: readonly PiProviderRecord[]): AiChatProviderConfigEntry[] {
  const entries: AiChatProviderConfigEntry[] = [];
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
      Number(isAiChatProviderConfigEntryConfigured(right)) - Number(isAiChatProviderConfigEntryConfigured(left));
    return methodDifference || configuredDifference || left.method.label.localeCompare(right.method.label);
  });
}

/** Returns whether the provider's active credential source configures this specific method. */
export function isAiChatProviderConfigEntryConfigured(entry: AiChatProviderConfigEntry): boolean {
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
export function getAiChatProviderConfigEntryStatusKind(
  entry: AiChatProviderConfigEntry,
): AiChatProviderStatusKind | undefined {
  if (isAiChatProviderConfigEntryConfigured(entry)) {
    return getAiChatProviderStatusKind(entry.provider);
  }
  return entry.method.kind === "external" ? "externalSetupRequired" : undefined;
}

/** Resolves the safe action for one method entry rather than for the provider as a whole. */
export function getAiChatProviderConfigEntryAction(
  entry: AiChatProviderConfigEntry,
): AiChatProviderPrimaryAction | undefined {
  if (entry.method.kind === "external") {
    return undefined;
  }
  if (isAiChatProviderConfigEntryConfigured(entry)) {
    if (entry.provider.authSource === "env" || entry.provider.authSource === "external") {
      return undefined;
    }
    return entry.method.kind === "oauth" ? { kind: "manageOauth" } : { kind: "manageApiKey" };
  }
  return { kind: "authenticate", method: entry.method.kind };
}

function getAiChatProviderStatusKind(provider: PiProviderRecord): AiChatProviderStatusKind | undefined {
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
export function isAiChatProviderConfiguredButUnavailable(provider: PiProviderRecord): boolean {
  return provider.hasAuth && !provider.available;
}

/** Builds one sorted provider list from providers that currently expose at least one available model. */
export function buildAvailableAiChatProviderOptions(models: readonly PiProviderModelRecord[]): ModelOption[] {
  const providersById = new Map<string, ModelOption>();
  for (const model of models) {
    if (!providersById.has(model.providerId)) {
      providersById.set(model.providerId, { id: model.providerId, name: model.providerName });
    }
  }
  return [...providersById.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** Builds one sorted model list for the selected provider from currently available models only. */
export function buildAvailableAiChatModelOptionsForProvider(
  models: readonly PiProviderModelRecord[],
  providerId: string | undefined,
): ModelOption[] {
  if (!providerId) {
    return [];
  }
  return models
    .filter((model) => model.providerId === providerId)
    .map<ModelOption>((model) => ({
      id: `${model.providerId}/${model.modelId}`,
      name: model.label,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
