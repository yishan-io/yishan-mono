import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuBadgeCheck, LuUser } from "react-icons/lu";
import { listAgentModels } from "../../../commands/agentCommands";
import {
  createAgentDefinition,
  getAgentDefinitionDetail,
  updateAgentDefinition,
} from "../../../commands/customizeCommands";
import { CenteredSpinner } from "../../../components/CenteredSpinner";
import { AgentModelSelector } from "../../../components/agent/session/AgentModelSelector";
import {
  clampThinkingLevel,
  formatSupportedThinkingLevels,
  isThinkingLevelSupported,
} from "../../../helpers/agentThinkingLevels";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import type { AgentDefinitionDetail, AgentDefinitionInfo } from "../../../rpc/daemonTypes";
import type { AgentModel } from "../../../store/agentChatTypes";
import { applyFrontmatterModelThinking } from "./agentDefinitionFrontmatter";

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
  const modelKey = trimmed.includes("/") ? trimmed.slice(trimmed.indexOf("/") + 1) : trimmed;
  return (
    models.find((candidate) => candidate.id === modelKey) ??
    models.find((candidate) => candidate.id.endsWith(`/${modelKey}`)) ??
    null
  );
}

/**
 * Extracts the provider prefix from a model id. Returns undefined when the id
 * has no provider prefix (e.g. "gpt-5.6-terra") so the shared picker falls
 * back to its "other" group instead of treating the whole id as a provider.
 */
function inferModelProvider(modelId: string): string | undefined {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex <= 0) {
    return undefined;
  }
  return modelId.slice(0, slashIndex).trim().toLowerCase();
}

/**
 * Reuses the agent chat composer's model list + thinking level control so
 * agent definitions pick from the same provider-grouped model menu. The
 * selected model id is stored in the definition frontmatter; thinking cycles
 * through pi's levels. An empty thinking means "inherit" (field omitted).
 */
function ModelThinkingSelector({ model, thinking, onModelChange, onThinkingChange }: ModelThinkingSelectorProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<AgentModel[]>([]);

  useEffect(() => {
    let cancelled = false;
    listAgentModels(AGENT_MODEL_KIND)
      .then((result) => {
        if (cancelled) return;
        setModels(
          result.models.map((entry) => {
            const provider = inferModelProvider(entry.id);
            return provider
              ? {
                  id: entry.id,
                  name: entry.name,
                  provider,
                  reasoning: entry.reasoning,
                  thinkingLevelMap: entry.thinkingLevelMap,
                }
              : {
                  id: entry.id,
                  name: entry.name,
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
      return [{ id: model, name: model }, ...models];
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

type AgentDetailDialogProps = {
  agent: AgentDefinitionInfo;
  onClose: () => void;
  onChanged: (messageKey: string) => void;
};

export function AgentDetailDialog({ agent, onClose, onChanged }: AgentDetailDialogProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AgentDefinitionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("");
  const [initialModel, setInitialModel] = useState("");
  const [initialThinking, setInitialThinking] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAgentDefinitionDetail(agent.name)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setContent(result.content);
        setModel(result.model);
        setThinking(result.thinking);
        setInitialModel(result.model);
        setInitialThinking(result.thinking);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agent.name]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      // Fold the selector's model/thinking into the definition frontmatter
      // only when the user explicitly changed the selector; otherwise the
      // frontmatter (as edited) stays authoritative and is never rewritten
      // with the seeded effective value.
      const selectorChanged = model.trim() !== initialModel || thinking !== initialThinking;
      await updateAgentDefinition({
        name: agent.name,
        content: selectorChanged ? applyFrontmatterModelThinking(content, model.trim(), thinking) : content,
      });
      onChanged("settings.customize.agents.messages.updated");
      onClose();
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onClose={isSaving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          {agent.official ? <LuBadgeCheck size={16} /> : <LuUser size={16} />}
          <Box component="span">{agent.name}</Box>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {loadError ? <Alert severity="error">{loadError}</Alert> : null}
        {detail ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {detail.description}
            </Typography>
            {agent.official ? (
              <Alert severity="info">{t("settings.customize.agents.dialogs.edit.officialHint")}</Alert>
            ) : null}
            <ModelThinkingSelector
              model={model}
              thinking={thinking}
              onModelChange={setModel}
              onThinkingChange={setThinking}
            />
            <TextField
              label={t("settings.customize.agents.dialogs.edit.contentLabel")}
              multiline
              minRows={14}
              maxRows={28}
              fullWidth
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
              }}
              sx={{ fontFamily: "monospace" }}
            />
            {saveError ? <Alert severity="error">{saveError}</Alert> : null}
          </Box>
        ) : loadError ? null : (
          <CenteredSpinner />
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={isSaving}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          disabled={isSaving || !detail}
          data-testid="agent-detail-save"
          onClick={() => {
            if (agent.official) {
              setShowOverwriteConfirm(true);
              return;
            }
            void handleSave();
          }}
        >
          {t("settings.customize.agents.actions.edit")}
        </Button>
      </DialogActions>
      {showOverwriteConfirm ? (
        <Dialog open onClose={isSaving ? undefined : () => setShowOverwriteConfirm(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{t("settings.customize.agents.dialogs.overwrite.title")}</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2">
              {t("settings.customize.agents.dialogs.overwrite.description", { name: agent.name })}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" onClick={() => setShowOverwriteConfirm(false)} disabled={isSaving}>
              {t("common.actions.cancel")}
            </Button>
            <Button
              color="warning"
              variant="contained"
              disabled={isSaving}
              onClick={() => {
                setShowOverwriteConfirm(false);
                void handleSave();
              }}
            >
              {t("settings.customize.agents.dialogs.overwrite.confirm")}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </Dialog>
  );
}

type CreateAgentDialogProps = {
  onClose: () => void;
  onCreated: () => void;
};

export function CreateAgentDialog({ onClose, onCreated }: CreateAgentDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("medium");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (isSubmitting) {
      return;
    }
    if (!name.trim()) {
      setError(t("settings.customize.agents.errors.nameRequired"));
      return;
    }
    if (!content.trim()) {
      setError(t("settings.customize.agents.errors.contentRequired"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const createdName = name.trim();
      await createAgentDefinition({
        name: createdName,
        description: description.trim(),
        content,
        model: model.trim(),
        thinking,
      });
      onCreated();
      onClose();
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("settings.customize.agents.dialogs.create.title")}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            autoFocus
            label={t("settings.customize.agents.dialogs.create.nameLabel")}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            helperText={t("settings.customize.agents.dialogs.create.nameHelp")}
          />
          <TextField
            label={t("settings.customize.agents.dialogs.create.descriptionLabel")}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
          <ModelThinkingSelector
            model={model}
            thinking={thinking}
            onModelChange={setModel}
            onThinkingChange={setThinking}
          />
          <TextField
            label={t("settings.customize.agents.dialogs.create.contentLabel")}
            multiline
            minRows={12}
            maxRows={24}
            fullWidth
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
            }}
            placeholder={t("settings.customize.agents.dialogs.create.contentPlaceholder")}
            sx={{ fontFamily: "monospace" }}
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={isSubmitting}>
          {t("common.actions.cancel")}
        </Button>
        <Button disabled={isSubmitting} onClick={() => void handleCreate()} data-testid="create-agent-submit">
          {t("settings.customize.agents.actions.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type ConfirmDialogProps = {
  titleKey: string;
  descriptionKey: string;
  confirmKey: string;
  name: string;
  confirmColor?: "error" | "warning";
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  titleKey,
  descriptionKey,
  confirmKey,
  name,
  confirmColor = "error",
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t(titleKey)}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2">{t(descriptionKey, { name })}</Typography>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          {t("common.actions.cancel")}
        </Button>
        <Button color={confirmColor} variant="contained" onClick={onConfirm}>
          {t(confirmKey)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
