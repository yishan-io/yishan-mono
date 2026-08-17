/** Extracts normalized model id/name pairs from ensure-session capabilities payloads. */
export function resolveAvailableModelsFromCapabilities(capabilities: unknown): Array<{ id: string; name: string }> {
  if (!capabilities || typeof capabilities !== "object") {
    return [];
  }

  const capabilitiesRecord = capabilities as Record<string, unknown>;
  const modelsRecord =
    capabilitiesRecord.models && typeof capabilitiesRecord.models === "object"
      ? (capabilitiesRecord.models as Record<string, unknown>)
      : null;
  const availableModels = Array.isArray(modelsRecord?.availableModels) ? modelsRecord.availableModels : [];

  return availableModels
    .map((model) => {
      if (!model || typeof model !== "object") {
        return null;
      }

      const modelRecord = model as Record<string, unknown>;
      const id =
        (typeof modelRecord.id === "string" && modelRecord.id) ||
        (typeof modelRecord.modelId === "string" && modelRecord.modelId) ||
        (typeof modelRecord.model === "string" && modelRecord.model) ||
        (typeof modelRecord[""] === "string" && (modelRecord[""] as string)) ||
        "";
      const name = (typeof modelRecord.name === "string" && modelRecord.name) || id;
      return {
        id,
        name,
      };
    })
    .filter((model): model is { id: string; name: string } => Boolean(model && model.id.trim().length > 0));
}

/** Extracts current model id from ensure-session capabilities payloads. */
export function resolveCurrentModelFromCapabilities(capabilities: unknown): string | undefined {
  if (!capabilities || typeof capabilities !== "object") {
    return undefined;
  }

  const capabilitiesRecord = capabilities as Record<string, unknown>;
  const modelsRecord =
    capabilitiesRecord.models && typeof capabilitiesRecord.models === "object"
      ? (capabilitiesRecord.models as Record<string, unknown>)
      : null;
  return typeof modelsRecord?.current === "string" && modelsRecord.current.trim().length > 0
    ? modelsRecord.current
    : undefined;
}
