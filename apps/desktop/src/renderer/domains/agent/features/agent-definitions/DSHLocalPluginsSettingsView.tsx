import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Input,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";

import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { listDSHLocalPlugins, registerDSHLocalPlugin, removeDSHLocalPlugin } from "../../daemon/daemonAgentProcedures";

type LocalBundle = { id: string; path: string };

/** Shows the local bundle UI only after the daemon confirms Developer Mode. */
export function DSHLocalPluginsSettingsView() {
  const [bundles, setBundles] = useState<LocalBundle[] | null>(null);
  const [id, setID] = useState("");
  const [path, setPath] = useState("");
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBundles((await listDSHLocalPlugins()).bundles);
    } catch {
      setBundles(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleRegister = useCallback(async () => {
    try {
      await registerDSHLocalPlugin({ id, path });
      setConfirmOpen(false);
      setError(null);
      await load();
    } catch (registrationError) {
      setError(getErrorMessage(registrationError));
    }
  }, [id, load, path]);
  const handleRemove = useCallback(
    async (bundleID: string) => {
      try {
        await removeDSHLocalPlugin({ id: bundleID });
        setError(null);
        await load();
      } catch (removalError) {
        setError(getErrorMessage(removalError));
      }
    },
    [load],
  );

  if (bundles === null) return null;
  return (
    <Box sx={{ mt: 3 }} data-testid="dsh-local-plugins-settings-panel">
      <Typography variant="h6">Developer local bundles</Typography>
      <Alert severity="warning" sx={{ my: 2 }}>
        Developer Mode loads code from explicitly registered local paths. Register only code you trust.
      </Alert>
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        <Input
          value={id}
          onChange={(event) => setID(event.target.value)}
          placeholder="Bundle ID"
          inputProps={{ "aria-label": "Local bundle ID" }}
        />
        <Input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="Absolute local bundle path"
          inputProps={{ "aria-label": "Local bundle path" }}
        />
        <Button disabled={!id || !path} onClick={() => setConfirmOpen(true)}>
          Register local bundle
        </Button>
      </Box>
      {bundles.map((bundle) => (
        <Box key={bundle.id} sx={{ display: "flex", gap: 1, mb: 1 }}>
          <Typography>
            {bundle.id}: {bundle.path}
          </Typography>
          <Button color="error" size="small" onClick={() => void handleRemove(bundle.id)}>
            Remove
          </Button>
        </Box>
      ))}
      <Dialog open={isConfirmOpen} onClose={() => setConfirmOpen(false)} aria-labelledby="dsh-local-confirm-title">
        <DialogTitle id="dsh-local-confirm-title">Register local DSH bundle?</DialogTitle>
        <DialogContent>
          <Typography>This lets Developer Mode load executable code from the selected local path.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleRegister()} color="warning">
            I understand, register
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
