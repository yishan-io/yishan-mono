import { getPiProviderDisplayName } from "./piProviders";

export const FALLBACK_MODEL_PROVIDER_ID = "other";
export const FALLBACK_MODEL_PROVIDER_NAME = "Other";

export type ModelPickerOption = {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
};

export type ModelPickerProviderGroup = {
  providerId: string;
  providerName: string;
  models: ModelPickerOption[];
};

/** The provider prefix and model key split out of a model id. */
export type ModelIdParts = {
  /** Lowercased provider prefix; empty when the id has no slash. */
  provider: string;
  /** Everything after the first slash, or the whole id when there is no slash. */
  modelKey: string;
};

/**
 * Splits a provider-prefixed model id on its first slash. Ids look like
 * "anthropic/claude-sonnet-4-5" or "openrouter/anthropic/claude-sonnet-4-5",
 * so the first segment is the provider and the remainder is the model key.
 * A slash-less id yields an empty provider and keeps the whole id as its key.
 */
export function splitModelId(modelId: string): ModelIdParts {
  const trimmed = modelId.trim();
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex < 0) {
    return { provider: "", modelKey: trimmed };
  }
  return {
    provider: trimmed.slice(0, slashIndex).trim().toLowerCase(),
    modelKey: trimmed.slice(slashIndex + 1).trim(),
  };
}

function inferProviderId(modelId: string): string {
  return splitModelId(modelId).provider || FALLBACK_MODEL_PROVIDER_ID;
}

/**
 * Strips a provider prefix from a model display name when present. The
 * daemon's pi model list reports `name` equal to the full id (e.g.
 * "anthropic/claude-sonnet-4-5"), so pickers must not show the provider
 * twice (once in the provider column, once as a prefix of the model name).
 * Only a prefix that matches the provider id or its display name is removed,
 * so human-readable names pass through unchanged.
 */
export function stripProviderPrefix(modelName: string, providerId: string, providerName: string): string {
  const trimmedModelName = modelName.trim();
  const lowerModelName = trimmedModelName.toLowerCase();
  const normalizedPrefixes = [providerId.trim().toLowerCase(), providerName.trim().toLowerCase()].filter(Boolean);

  for (const prefix of normalizedPrefixes) {
    if (lowerModelName.startsWith(`${prefix}/`)) {
      return trimmedModelName.slice(prefix.length + 1).trim() || trimmedModelName;
    }
  }

  return trimmedModelName;
}

/** Builds one normalized model-picker option from model metadata. */
export function buildModelPickerOption(input: {
  id: string;
  name: string;
  providerId?: string;
  providerName?: string;
}): ModelPickerOption {
  const providerId = input.providerId?.trim().toLowerCase() || inferProviderId(input.id);
  const providerName =
    input.providerName?.trim() || getPiProviderDisplayName(providerId) || FALLBACK_MODEL_PROVIDER_NAME;

  return {
    id: input.id,
    name: input.name,
    providerId,
    providerName,
  };
}

/** Groups normalized model-picker options by provider while preserving order. */
export function groupModelPickerOptionsByProvider(options: ModelPickerOption[]): ModelPickerProviderGroup[] {
  const providerGroups = new Map<string, ModelPickerProviderGroup>();

  for (const option of options) {
    const existingGroup = providerGroups.get(option.providerId);
    if (existingGroup) {
      existingGroup.models.push(option);
      continue;
    }

    providerGroups.set(option.providerId, {
      providerId: option.providerId,
      providerName: option.providerName,
      models: [option],
    });
  }

  return Array.from(providerGroups.values());
}
