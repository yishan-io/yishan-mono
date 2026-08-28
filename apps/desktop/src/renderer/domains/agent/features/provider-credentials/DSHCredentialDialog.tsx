import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useState } from "react";
import { saveDSHCredential } from "../../commands/dshCredentialCommands";

type DSHCredentialDialogProps = {
  open: boolean;
  credentialRef: string;
  providerName: string;
  onClose: () => void;
  onSaved: () => void;
};

/** Simple dialog to save one DSH API key credential (ref → value). */
export function DSHCredentialDialog({ open, credentialRef, providerName, onClose, onSaved }: DSHCredentialDialogProps) {
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !isSaving;

  const handleClose = () => {
    if (isSaving) return;
    setValue("");
    setError(null);
    onClose();
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveDSHCredential({ ref: credentialRef, value: trimmed });
      setValue("");
      setIsSaving(false);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void handleSave();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{providerName} API Key</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter your {providerName} API key. It will be stored in the Yishan DSH credentials file.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          size="small"
          aria-label={credentialRef}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          error={Boolean(error)}
          helperText={error ?? undefined}
          placeholder="sk-..."
        />
        {error && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={!canSave}>
          {isSaving ? <CircularProgress size={16} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
