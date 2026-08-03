import { getPiProviderDisplayName } from "../helpers/piProviders";

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

function inferProviderId(modelId: string): string {
  const trimmedModelId = modelId.trim();
  const slashIndex = trimmedModelId.indexOf("/");
  if (slashIndex <= 0) {
    return FALLBACK_MODEL_PROVIDER_ID;
  }
  return trimmedModelId.slice(0, slashIndex).trim().toLowerCase() || FALLBACK_MODEL_PROVIDER_ID;
}

/** Builds one normalized model-picker option from model metadata. */
export function buildModelPickerOption(input: {
  id: string;
  name: string;
  providerId?: string;
  providerName?: string;
}): ModelPickerOption {
  const providerId = input.providerId?.trim().toLowerCase() || inferProviderId(input.id);
  const providerName = input.providerName?.trim() || getPiProviderDisplayName(providerId) || FALLBACK_MODEL_PROVIDER_NAME;

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
