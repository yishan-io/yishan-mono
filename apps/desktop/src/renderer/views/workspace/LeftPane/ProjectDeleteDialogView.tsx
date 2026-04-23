import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
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
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{t("repo.actions.delete")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t("repo.delete.confirm", {
            name: repoName,
          })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isDeleting}>
          {t("common.actions.cancel")}
        </Button>
        <Button color="error" onClick={onConfirm} disabled={isDeleting}>
          {t("repo.actions.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
