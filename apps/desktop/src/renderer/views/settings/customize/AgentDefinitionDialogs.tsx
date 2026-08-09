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
} from "../../../commands/customizeCommands";
import { CenteredSpinner } from "../../../components/CenteredSpinner";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import type { AgentDefinitionDetail, AgentDefinitionInfo } from "../../../rpc/daemonTypes";

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
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {detail.description}
            </Typography>
            {agent.official ? (
              <Alert severity="info">{t("settings.customize.agents.dialogs.edit.officialHint")}</Alert>
            ) : null}
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
        <Button onClick={onClose} disabled={isSaving}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="contained"
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
            <Button onClick={() => setShowOverwriteConfirm(false)} disabled={isSaving}>
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
      await createAgentDefinition({ name: name.trim(), description: description.trim(), content });
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
        <Button onClick={onClose} disabled={isSubmitting}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={isSubmitting}
          onClick={() => void handleCreate()}
          data-testid="create-agent-submit"
        >
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
        <Button onClick={onClose}>{t("common.actions.cancel")}</Button>
        <Button color={confirmColor} variant="contained" onClick={onConfirm}>
          {t(confirmKey)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
