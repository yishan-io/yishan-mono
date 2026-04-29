import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateProjectFormView } from "./CreateProjectFormView";

type CreateProjectDialogViewProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateProjectDialogView({ open, onClose }: CreateProjectDialogViewProps) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);

  const handleClose = () => {
    if (isCreating) {
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" disableEscapeKeyDown={isCreating}>
      <DialogTitle>{t("project.actions.addRepository")}</DialogTitle>
      <DialogContent sx={{ pb: 2.5 }}>
        <CreateProjectFormView onCreated={onClose} onCancel={handleClose} onBusyChange={setIsCreating} />
      </DialogContent>
    </Dialog>
  );
}
