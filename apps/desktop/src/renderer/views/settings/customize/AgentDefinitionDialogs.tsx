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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuBadgeCheck, LuUser } from "react-icons/lu";
import {
  createAgentDefinition,
  getAgentDefinitionDetail,
  updateAgentDefinition,
} from "../../../features/settings/commands/customizeCommands";
import { CenteredSpinner } from "../../../components/CenteredSpinner";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import type { AgentDefinitionDetail, AgentDefinitionInfo } from "../../../rpc/daemonTypes";
import { FieldLabel } from "./AgentDefinitionFieldLabel";
import { AgentToolsEditor, sameToolList } from "./AgentToolsEditor";
import { ModelThinkingSelector } from "./ModelThinkingSelector";
import {
  type AgentFrontmatterChanges,
  applyFrontmatterMetadata,
  replaceAgentBody,
  splitAgentBody,
} from "./agentDefinitionFrontmatter";

type AgentDetailDialogProps = {
  agent: AgentDefinitionInfo;
  onClose: () => void;
  onChanged: (messageKey: string) => void;
};

/**
 * Edit dialog for one agent definition. The frontmatter metadata (description,
 * model, thinking, tools) is managed through structured fields and the
 * markdown editor shows only the prompt body — never the frontmatter. On save
 * the dialog rebuilds the definition file from the structured fields + body,
 * rewriting only the fields the user changed so untouched frontmatter lines
 * stay verbatim.
 */
export function AgentDetailDialog({ agent, onClose, onChanged }: AgentDetailDialogProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AgentDefinitionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [initialBody, setInitialBody] = useState("");
  const [initialDescription, setInitialDescription] = useState("");
  const [initialModel, setInitialModel] = useState("");
  const [initialThinking, setInitialThinking] = useState("");
  const [initialTools, setInitialTools] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAgentDefinitionDetail(agent.name)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        const nextBody = splitAgentBody(result.content);
        setBody(nextBody);
        setDescription(result.description);
        setModel(result.model);
        setThinking(result.thinking);
        setTools(result.tools);
        setInitialBody(nextBody);
        setInitialDescription(result.description);
        setInitialModel(result.model);
        setInitialThinking(result.thinking);
        setInitialTools(result.tools);
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
    if (!detail) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      // Rebuild the definition file from the structured fields + body. Only
      // fields the user actually changed are folded into the frontmatter;
      // otherwise the file (as edited) stays authoritative and is never
      // rewritten with the seeded effective values.
      const changes: AgentFrontmatterChanges = {};
      if (description.trim() !== initialDescription) {
        changes.description = description;
      }
      if (model.trim() !== initialModel) {
        changes.model = model;
      }
      if (thinking !== initialThinking) {
        changes.thinking = thinking;
      }
      if (!sameToolList(tools, initialTools)) {
        changes.tools = tools;
      }
      let content = detail.content;
      if (Object.keys(changes).length > 0) {
        content = applyFrontmatterMetadata(content, changes);
      }
      if (body !== initialBody) {
        content = replaceAgentBody(content, body);
      }
      await updateAgentDefinition({ name: agent.name, content });
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
            {agent.official ? (
              <Alert severity="info">{t("settings.customize.agents.dialogs.edit.officialHint")}</Alert>
            ) : null}
            <Box>
              <FieldLabel>{t("settings.customize.agents.dialogs.edit.descriptionLabel")}</FieldLabel>
              <TextField
                multiline
                minRows={2}
                maxRows={4}
                fullWidth
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                slotProps={{
                  htmlInput: {
                    "aria-label": t("settings.customize.agents.dialogs.edit.descriptionLabel"),
                  },
                }}
              />
            </Box>
            <ModelThinkingSelector
              model={model}
              thinking={thinking}
              onModelChange={setModel}
              onThinkingChange={setThinking}
            />
            <Box>
              <FieldLabel>{t("settings.customize.agents.dialogs.toolsLabel")}</FieldLabel>
              <AgentToolsEditor
                tools={tools}
                onChange={(nextTools) => {
                  setTools(nextTools);
                }}
              />
            </Box>
            <Box>
              <FieldLabel>{t("settings.customize.agents.dialogs.edit.contentLabel")}</FieldLabel>
              <TextField
                multiline
                minRows={8}
                maxRows={16}
                fullWidth
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                }}
                sx={{ fontFamily: "monospace" }}
                slotProps={{
                  htmlInput: {
                    "aria-label": t("settings.customize.agents.dialogs.edit.contentLabel"),
                  },
                }}
              />
            </Box>
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
  const [tools, setTools] = useState<string[]>([]);
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
        tools,
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
          <Box>
            <FieldLabel>{t("settings.customize.agents.dialogs.create.nameLabel")}</FieldLabel>
            <TextField
              autoFocus
              fullWidth
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              helperText={t("settings.customize.agents.dialogs.create.nameHelp")}
              slotProps={{
                htmlInput: {
                  "aria-label": t("settings.customize.agents.dialogs.create.nameLabel"),
                },
              }}
            />
          </Box>
          <Box>
            <FieldLabel>{t("settings.customize.agents.dialogs.create.descriptionLabel")}</FieldLabel>
            <TextField
              fullWidth
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              slotProps={{
                htmlInput: {
                  "aria-label": t("settings.customize.agents.dialogs.create.descriptionLabel"),
                },
              }}
            />
          </Box>
          <ModelThinkingSelector
            model={model}
            thinking={thinking}
            onModelChange={setModel}
            onThinkingChange={setThinking}
          />
          <Box>
            <FieldLabel>{t("settings.customize.agents.dialogs.toolsLabel")}</FieldLabel>
            <AgentToolsEditor
              tools={tools}
              onChange={(nextTools) => {
                setTools(nextTools);
              }}
            />
          </Box>
          <Box>
            <FieldLabel>{t("settings.customize.agents.dialogs.create.contentLabel")}</FieldLabel>
            <TextField
              multiline
              minRows={8}
              maxRows={16}
              fullWidth
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
              }}
              placeholder={t("settings.customize.agents.dialogs.create.contentPlaceholder")}
              sx={{ fontFamily: "monospace" }}
              slotProps={{
                htmlInput: {
                  "aria-label": t("settings.customize.agents.dialogs.create.contentLabel"),
                },
              }}
            />
          </Box>
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
