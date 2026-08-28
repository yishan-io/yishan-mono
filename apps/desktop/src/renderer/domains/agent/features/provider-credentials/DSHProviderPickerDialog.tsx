import {
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
import type { DSHProviderCatalogEntry } from "../../daemon/daemonAgentTypes";

type DSHProviderPickerDialogProps = {
  open: boolean;
  providers: DSHProviderCatalogEntry[];
  onClose: () => void;
  onSelect: (provider: DSHProviderCatalogEntry) => void;
};

/** Selects a DSH provider route and exposes only its safe setup state. */
export function DSHProviderPickerDialog({ open, providers, onClose, onSelect }: DSHProviderPickerDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Choose a provider</DialogTitle>
      <DialogContent>
        <List disablePadding aria-label="DSH providers">
          {providers.map((provider) => (
            <ListItemButton key={provider.id} onClick={() => onSelect(provider)}>
              <ListItemText
                primary={provider.displayName}
                secondary={provider.configured ? "Ready to use" : "Needs setup"}
              />
            </ListItemButton>
          ))}
        </List>
        {providers.length === 0 ? (
          <Typography color="text.secondary">No DSH providers are available.</Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
