import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { DSHProviderCatalogEntry } from "../../daemon/daemonAgentTypes";

type DSHProviderPickerDialogProps = {
  open: boolean;
  providers: DSHProviderCatalogEntry[];
  onClose: () => void;
  onSelect: (provider: DSHProviderCatalogEntry) => void;
};

/** Selects a DSH provider route and exposes only its safe setup state. */
export function DSHProviderPickerDialog({ open, providers, onClose, onSelect }: DSHProviderPickerDialogProps) {
  const [ambientGuidance, setAmbientGuidance] = useState<string | null>(null);

  const handleClose = () => {
    setAmbientGuidance(null);
    onClose();
  };

  const handleSelect = (provider: DSHProviderCatalogEntry) => {
    if (provider.authentication === "ambient") {
      setAmbientGuidance(provider.setupGuidance);
      return;
    }
    onSelect(provider);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Choose a provider</DialogTitle>
      <DialogContent>
        <List disablePadding aria-label="DSH providers">
          {providers.map((provider) => (
            <ListItemButton key={provider.id} onClick={() => handleSelect(provider)}>
              <ListItemText primary={provider.displayName} secondary={provider.setupGuidance} />
            </ListItemButton>
          ))}
        </List>
        {ambientGuidance ? <Alert severity="info">{ambientGuidance}</Alert> : null}
        {providers.length === 0 ? (
          <Typography color="text.secondary">No DSH providers are available.</Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
