import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type TabRenameDialogProps = {
  open: boolean;
  currentTitle: string;
  untitledLabel: string;
  onSave: (title: string) => void;
  onClose: () => void;
};

/**
 * Modal dialog for renaming a tab. Auto-focuses the text field and
 * selects all text on open. Enter saves, Escape cancels.
 */
export function TabRenameDialog({ open, currentTitle, untitledLabel, onSave, onClose }: TabRenameDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      const initial = currentTitle || untitledLabel;
      setDraft(initial);
      // Auto-focus and select all after the dialog renders.
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }, [open, currentTitle, untitledLabel]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onSave(trimmed);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("tabs.renameDialog.title", "Rename Tab")}</DialogTitle>
      <DialogContent>
        <TextField
          inputRef={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          fullWidth
          margin="dense"
          size="small"
          label={t("tabs.renameDialog.label", "Tab name")}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("tabs.renameDialog.cancel", "Cancel")}</Button>
        <Button onClick={handleSave} variant="contained" disabled={!draft.trim()}>
          {t("tabs.renameDialog.save", "Save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
