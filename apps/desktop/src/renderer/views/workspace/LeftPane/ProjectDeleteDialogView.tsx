import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type ProjectDeleteDialogViewProps = {
  open: boolean;
  repoName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Renders repository deletion confirmation dialog. */
export function ProjectDeleteDialogView({
  open,
  repoName,
  isDeleting,
  onCancel,
  onConfirm,
}: ProjectDeleteDialogViewProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={isDeleting ? undefined : onCancel} fullWidth maxWidth="xs" disableEscapeKeyDown={isDeleting}>
      <DialogTitle>{t("project.actions.delete")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t("project.delete.confirm", {
            name: repoName,
          })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isDeleting}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          color="error"
          onClick={onConfirm}
          disabled={isDeleting}
          startIcon={isDeleting ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {isDeleting ? t("common.actions.deleting", { defaultValue: "Deleting..." }) : t("project.actions.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
