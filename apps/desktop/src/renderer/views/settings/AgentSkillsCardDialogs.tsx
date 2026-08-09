import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { MarkdownPreview } from "@renderer/components/markdown/MarkdownPreview";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiFlowArrowBold, PiXBold } from "react-icons/pi";
import { addSkill, getSkillDetail } from "../../commands/skillCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { getErrorMessage } from "../../helpers/errorHelpers";
import type { SkillDetail, SkillInfo } from "../../rpc/daemonTypes";

const DIALOG_SIZE = { xs: "100%", sm: 800 };

type SkillDetailDialogProps = {
  skill: SkillInfo;
  onClose: () => void;
};

export function SkillDetailDialog({ skill, onClose }: SkillDetailDialogProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSkillDetail(skill.name)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [skill.name]);

  const readme = detail?.files["SKILL.md"] ?? "";

  return (
    <Dialog open onClose={onClose} maxWidth={false} fullWidth sx={{ "& .MuiDialog-paper": { maxWidth: DIALOG_SIZE } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          <PiFlowArrowBold size={16} />
          <Box component="span">{skill.name}</Box>
        </Box>
        <IconButton onClick={onClose} aria-label={t("settings.back")}>
          <PiXBold size={16} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loadError ? <Alert severity="error">{loadError}</Alert> : null}
        {detail ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              {skill.description}
            </Typography>

            {detail.source ? (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                  }}
                >
                  {t("settings.skills.sourceLabel")}
                </Typography>
                <Typography variant="body2">{detail.source}</Typography>
              </Box>
            ) : null}

            {readme ? (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                    mb: 1,
                  }}
                >
                  {t("settings.skills.instruction")}
                </Typography>
                <Box
                  sx={{
                    height: "calc(100vh - 350px)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <MarkdownPreview content={readme} />
                </Box>
              </Box>
            ) : null}
          </Box>
        ) : loadError ? null : (
          <CenteredSpinner />
        )}
      </DialogContent>
    </Dialog>
  );
}

type AddSkillDialogProps = {
  onClose: () => void;
  onAdded: () => void;
};

export function AddSkillDialog({ onClose, onAdded }: AddSkillDialogProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (isSubmitting) {
      return;
    }
    const trimmed = source.trim();
    if (!trimmed) {
      setError(t("settings.skills.errors.sourceRequired"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await addSkill(trimmed);
      onAdded();
      onClose();
    } catch (addError) {
      setError(getErrorMessage(addError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("settings.skills.dialogs.add.title")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
          {t("settings.skills.dialogs.add.description")}
        </Typography>
        <TextField
          autoFocus
          fullWidth
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
          }}
          placeholder={t("settings.skills.dialogs.add.placeholder")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleAdd();
            }
          }}
        />
        {error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          {t("common.actions.cancel")}
        </Button>
        <Button disabled={isSubmitting} onClick={() => void handleAdd()}>
          {t("settings.skills.dialogs.add.install")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type RemoveSkillDialogProps = {
  skill: SkillInfo;
  onClose: () => void;
  onConfirm: () => void;
};

export function RemoveSkillDialog({ skill, onClose, onConfirm }: RemoveSkillDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("settings.skills.dialogs.remove.title")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2">{t("settings.skills.dialogs.remove.description", { name: skill.name })}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.actions.cancel")}</Button>
        <Button color="error" variant="contained" onClick={onConfirm}>
          {t("settings.skills.dialogs.remove.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
