import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useDialogRegistration } from "../hooks/useDialogRegistration";

export type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmColor?: "error" | "warning" | "primary" | "secondary";
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Renders a generic two-button confirmation dialog. */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmColor = "primary",
  isSubmitting = false,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  useDialogRegistration(open);

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onCancel}
      fullWidth
      maxWidth="xs"
      disableEscapeKeyDown={isSubmitting}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isSubmitting}>
          {cancelLabel}
        </Button>
        <Button
          color={confirmColor}
          onClick={onConfirm}
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
