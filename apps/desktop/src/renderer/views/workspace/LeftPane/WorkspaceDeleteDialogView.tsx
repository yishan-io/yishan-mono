import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useDialogRegistration } from "../../../hooks/useDialogRegistration";

type WorkspaceDeleteDialogViewProps = {
  open: boolean;
  workspaceName: string;
  allowRemoveBranch: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onAllowRemoveBranchChange: (nextValue: boolean) => void;
};

/** Renders workspace deletion confirmation dialog with optional branch removal toggle. */
export function WorkspaceDeleteDialogView({
  open,
  workspaceName,
  allowRemoveBranch,
  isDeleting,
  onCancel,
  onConfirm,
  onAllowRemoveBranchChange,
}: WorkspaceDeleteDialogViewProps) {
  const { t } = useTranslation();
  useDialogRegistration(open);

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{t("workspace.actions.delete")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t("workspace.delete.confirm", {
            name: workspaceName,
          })}
        </Typography>
        <FormControlLabel
          sx={{ mt: 1 }}
          control={
            <Checkbox
              checked={allowRemoveBranch}
              onChange={(event) => {
                onAllowRemoveBranchChange(event.target.checked);
              }}
            />
          }
          label={t("workspace.delete.removeBranch")}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isDeleting}>
          {t("common.actions.cancel")}
        </Button>
        <Button color="error" onClick={onConfirm} disabled={isDeleting}>
          {t("workspace.actions.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
