import { Button, CircularProgress, Typography } from "@mui/material";

type WorkspaceDialogSubmitButtonProps = {
  submitLabel: string;
  submitShortcutLabel: string;
  isCreatingWorkspace: boolean;
  disabled: boolean;
  onClick: () => void;
};

/** Renders the shared submit button for the workspace dialog. */
export function WorkspaceDialogSubmitButton({
  submitLabel,
  submitShortcutLabel,
  isCreatingWorkspace,
  disabled,
  onClick,
}: WorkspaceDialogSubmitButtonProps) {
  return (
    <Button
      size="medium"
      variant="contained"
      onClick={onClick}
      disabled={disabled}
      sx={{ borderRadius: 2.5, textTransform: "none", py: 1, position: "relative", gap: 1 }}
    >
      {isCreatingWorkspace ? <CircularProgress size={16} color="inherit" /> : null}
      <Typography component="span" sx={{ mx: "auto", fontWeight: 500 }}>
        {submitLabel}
      </Typography>
      <Typography component="span" variant="caption" sx={{ opacity: 0.7 }}>
        {submitShortcutLabel}
      </Typography>
    </Button>
  );
}
