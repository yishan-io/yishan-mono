import type { AgentModel } from "../../store/agentChatTypes";

export const FALLBACK_MODEL_PROVIDER_NAME = "Other";

/** Provider group used by the agent model selector menu. */
export type AgentModelProviderGroup = {
  provider: string;
  models: AgentModel[];
};

/** Returns the normalized provider label used by the model selector. */
export function getAgentModelProviderName(model: AgentModel): string {
  const providerName = model.provider?.trim();
  return providerName ? providerName : FALLBACK_MODEL_PROVIDER_NAME;
}

/** Formats the selected model label shown in the trigger button. */
export function formatAgentModelLabel(model: AgentModel): string {
  const providerName = model.provider?.trim();
  return providerName ? `${providerName}/${model.name}` : model.name;
}

/** Groups models by provider while preserving their original order. */
export function groupAgentModelsByProvider(models: AgentModel[]): AgentModelProviderGroup[] {
  const providerGroups = new Map<string, AgentModel[]>();

  for (const model of models) {
    const providerName = getAgentModelProviderName(model);
    const groupedModels = providerGroups.get(providerName);

    if (groupedModels) {
      groupedModels.push(model);
      continue;
    }

    providerGroups.set(providerName, [model]);
  }

  return Array.from(providerGroups.entries()).map(([provider, groupedModels]) => ({
    provider,
    models: groupedModels,
  }));
}
