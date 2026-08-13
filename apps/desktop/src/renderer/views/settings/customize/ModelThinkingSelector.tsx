import { Box, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listAgentModels } from "../../../commands/agentCommands";
import { AgentModelSelector } from "../../../components/agent/session/AgentModelSelector";
import { splitModelId, stripProviderPrefix } from "../../../components/modelPicker";
import {
  clampThinkingLevel,
  formatSupportedThinkingLevels,
  isThinkingLevelSupported,
} from "../../../helpers/agentThinkingLevels";
import { getPiProviderDisplayName } from "../../../helpers/piProviders";
import type { AgentModel } from "../../../store/agentChatTypes";

type ModelThinkingSelectorProps = {
  model: string;
  thinking: string;
  onModelChange: (model: string) => void;
  onThinkingChange: (thinking: string) => void;
};

// AGENT_MODEL_KIND is the pi runtime agent kind used to list available models.
const AGENT_MODEL_KIND = "pi";

/**
 * Finds the fetched model entry that best matches a frontmatter model value.
 * The md file may write the model with or without the provider prefix (e.g.
 * "claude-sonnet-4-5", "anthropic/claude-sonnet-4-5", or
 * "openrouter/anthropic/claude-sonnet-4-5"), so exact id matching alone
 * would leave the picker showing a raw synthetic entry. Match the exact id
 * first, then the bare model key (everything after the first slash).
 */
function findMatchingModel(modelId: string, models: AgentModel[]): AgentModel | null {
  const trimmed = modelId.trim();
  if (trimmed === "") {
    return null;
  }
  const exact = models.find((candidate) => candidate.id === trimmed);
  if (exact) {
    return exact;
  }
  const modelKey = splitModelId(trimmed).modelKey;
  return (
    models.find((candidate) => candidate.id === modelKey) ??
    models.find((candidate) => candidate.id.endsWith(`/${modelKey}`)) ??
    null
  );
}

/**
 * Returns the display name for a model id. The daemon reports `name` equal to
 * the full id ("anthropic/claude-sonnet-4-5"), so the provider prefix is
 * stripped to avoid showing it twice (provider column + model name).
 */
function modelDisplayName(id: string, rawName: string): string {
  const provider = splitModelId(id).provider;
  if (!provider) {
    return rawName;
  }
  return stripProviderPrefix(rawName, provider, getPiProviderDisplayName(provider));
}

/**
 * Reuses the agent chat composer's model list + thinking level control so
 * agent definitions pick from the same provider-grouped model menu. The
 * selected model id is stored in the definition frontmatter; thinking cycles
 * through pi's levels. An empty thinking means "inherit" (field omitted).
 */
export function ModelThinkingSelector({
  model,
  thinking,
  onModelChange,
  onThinkingChange,
}: ModelThinkingSelectorProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<AgentModel[]>([]);

  useEffect(() => {
    let cancelled = false;
    listAgentModels(AGENT_MODEL_KIND)
      .then((result) => {
        if (cancelled) return;
        setModels(
          result.models.map((entry) => {
            const provider = splitModelId(entry.id).provider || undefined;
            const name = modelDisplayName(entry.id, entry.name);
            return provider
              ? {
                  id: entry.id,
                  name,
                  provider,
                  reasoning: entry.reasoning,
                  thinkingLevelMap: entry.thinkingLevelMap,
                }
              : {
                  id: entry.id,
                  name,
                  reasoning: entry.reasoning,
                  thinkingLevelMap: entry.thinkingLevelMap,
                };
          }),
        );
      })
      .catch(() => {
        // Model list unavailable: the selector still renders so thinking can
        // be cycled; the model menu stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The md file may define the model with or without the provider prefix
  // (e.g. "claude-sonnet-4-5", "anthropic/claude-sonnet-4-5", or
  // "openrouter/anthropic/claude-sonnet-4-5"), so the seeded value is matched
  // leniently against the fetched list: exact id first, then by the model key
  // (the part after the first slash).
  const matchedModel = useMemo(() => (model === "" ? null : findMatchingModel(model, models)), [model, models]);

  // When the seeded model matches nothing in the fetched list (provider
  // removed, or list fetch failed), surface it as a synthetic option so the
  // configured value stays visible instead of showing a bare "Select model".
  // Provider is left unset so the shared picker infers it (prefix -> provider,
  // otherwise "other").
  const effectiveModels = useMemo(() => {
    if (model !== "" && !matchedModel) {
      return [{ id: model, name: modelDisplayName(model, model) }, ...models];
    }
    return models;
  }, [matchedModel, model, models]);

  const currentModel = useMemo(
    () => matchedModel ?? effectiveModels.find((candidate) => candidate.id === model) ?? null,
    [effectiveModels, matchedModel, model],
  );

  const handleThinkingSelect = useCallback(
    (level: string) => {
      onThinkingChange(level);
    },
    [onThinkingChange],
  );

  const thinkingWarning = useMemo(() => {
    // Only warn when the model's real capability map is known; the full-list
    // fallback for models without map data must never be presented as fact.
    if (thinking === "" || !currentModel?.thinkingLevelMap || isThinkingLevelSupported(thinking, currentModel)) {
      return null;
    }
    const clamped = clampThinkingLevel(thinking, currentModel);
    return t("settings.customize.agents.dialogs.modelThinking.thinkingUnsupported", {
      level: thinking,
      model: currentModel.name,
      clamped,
    });
  }, [currentModel, t, thinking]);

  return (
    <Box>
      <AgentModelSelector
        models={effectiveModels}
        currentModel={currentModel}
        thinkingLevel={thinking}
        onModelChange={(nextModel) => onModelChange(nextModel.id)}
        onThinkingLevelSelect={handleThinkingSelect}
      />
      {thinkingWarning ? (
        <Typography variant="caption" sx={{ color: "warning.main", display: "block", mt: 0.5 }}>
          {thinkingWarning}
        </Typography>
      ) : null}
      {currentModel?.thinkingLevelMap ? (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>
          {t("settings.customize.agents.dialogs.modelThinking.supportedLevels", {
            model: currentModel.name,
            levels: formatSupportedThinkingLevels(currentModel),
          })}
        </Typography>
      ) : null}
    </Box>
  );
}
