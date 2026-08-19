import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialogRegistration } from "../../../../domains/workbench";
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

  const handleDialogClose = (_event: React.SyntheticEvent, reason: "backdropClick" | "escapeKeyDown") => {
    if (reason === "escapeKeyDown" && isCreating) {
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="lg">
      <DialogTitle>{t("scheduledJob.form.title")}</DialogTitle>
      <DialogContent sx={{ pb: 2.5, pt: 1.5 }}>
        <CreateScheduledJobFormView onCreated={onClose} onCancel={handleClose} onBusyChange={setIsCreating} />
      </DialogContent>
    </Dialog>
  );
}
