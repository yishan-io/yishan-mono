import type { PiProviderModelRecord } from "../../shared/contracts/piProviderConfig";

/** Maximum serialized length for one Desktop AI Chat provider/model selection. */
export const AI_CHAT_MODEL_PATTERN_MAX_LENGTH = 512;

/** Provider and model selected for new Desktop AI Chat sessions. */
export type AiChatModelSelection = {
  providerId: string;
  modelId: string;
};

/** Parses one persisted `provider/model` value into a validated selection. */
export function parseAiChatModelSelection(value: unknown): AiChatModelSelection | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const pattern = value.trim();
  const separatorIndex = pattern.indexOf("/");
  if (separatorIndex <= 0 || pattern.length > AI_CHAT_MODEL_PATTERN_MAX_LENGTH) {
    return undefined;
  }
  return normalizeAiChatModelSelection({
    providerId: pattern.slice(0, separatorIndex),
    modelId: pattern.slice(separatorIndex + 1),
  });
}

/** Normalizes one untrusted structured Desktop AI Chat model selection. */
export function normalizeAiChatModelSelection(value: unknown): AiChatModelSelection | undefined {
  if (!isRecord(value) || typeof value.providerId !== "string" || typeof value.modelId !== "string") {
    return undefined;
  }
  const providerId = value.providerId.trim();
  const modelId = value.modelId.trim();
  if (!providerId || providerId.includes("/") || !modelId) {
    return undefined;
  }
  if (`${providerId}/${modelId}`.length > AI_CHAT_MODEL_PATTERN_MAX_LENGTH) {
    return undefined;
  }
  return { providerId, modelId };
}

/** Formats one valid structured selection for the daemon Pi start contract. */
export function formatAiChatModelSelection(selection: AiChatModelSelection): string | undefined {
  const normalized = normalizeAiChatModelSelection(selection);
  return normalized ? `${normalized.providerId}/${normalized.modelId}` : undefined;
}

/** Returns true when the current runtime exposes the selected model as available. */
export function isAiChatModelSelectionAvailable(
  models: readonly PiProviderModelRecord[],
  selection: AiChatModelSelection | undefined,
): boolean {
  if (!selection) {
    return false;
  }
  return models.some(
    (model) => model.available && model.providerId === selection.providerId && model.modelId === selection.modelId,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
