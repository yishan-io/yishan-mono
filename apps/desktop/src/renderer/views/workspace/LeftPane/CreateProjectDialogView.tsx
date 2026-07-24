import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialogRegistration } from "../../../hooks/useDialogRegistration";
import { CreateProjectFormView } from "./CreateProjectFormView";

type CreateProjectDialogViewProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateProjectDialogView({ open, onClose }: CreateProjectDialogViewProps) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  useDialogRegistration(open);

  const handleClose = () => {
    if (isCreating) {
      return;
    }
    onClose();
  };

  const handleDialogClose = (_event: React.SyntheticEvent, reason: "backdropClick" | "escapeKeyDown") => {
    if (reason === "escapeKeyDown" && isCreating) {
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("project.actions.addRepository")}</DialogTitle>
      <DialogContent sx={{ pb: 2.5 }}>
        <CreateProjectFormView onCreated={onClose} onCancel={handleClose} onBusyChange={setIsCreating} />
      </DialogContent>
    </Dialog>
  );
}
