import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialogRegistration } from "../../hooks/useDialogRegistration";
import { CreateScheduledJobFormView } from "./CreateScheduledJobFormView";

type CreateScheduledJobDialogViewProps = {
  open: boolean;
  onClose: () => void;
};

/** Dialog wrapper for the new scheduled job form. */
export function CreateScheduledJobDialogView({ open, onClose }: CreateScheduledJobDialogViewProps) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  useDialogRegistration(open);

  const handleClose = () => {
    if (isCreating) {
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg" disableEscapeKeyDown={isCreating}>
      <DialogTitle>{t("scheduledJob.form.title")}</DialogTitle>
      <DialogContent sx={{ pb: 2.5, pt: 1.5 }}>
        <CreateScheduledJobFormView onCreated={onClose} onCancel={handleClose} onBusyChange={setIsCreating} />
      </DialogContent>
    </Dialog>
  );
}
