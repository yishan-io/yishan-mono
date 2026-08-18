import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { getPiProviderDisplayName } from "@renderer/domains/agent";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { type PiProviderStatus, removePiProvider } from "@renderer/domains/agent";
import { getErrorMessage } from "../../../../helpers/errorHelpers";

export function RemoveProviderDialog({
  open,
  provider,
  onClose,
  onRemoved,
}: {
  open: boolean;
  provider: PiProviderStatus | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setIsRemoving(false);
    }
  }, [open]);

  const handleRemove = async () => {
    if (!provider || isRemoving) {
      return;
    }
    setIsRemoving(true);
    setError(null);
    try {
      await removePiProvider(provider.provider);
      onRemoved();
    } catch (err) {
      setError(getErrorMessage(err));
      setIsRemoving(false);
    }
  };

  const providerName = provider ? getPiProviderDisplayName(provider.provider) : "";

  return (
    <Dialog open={open} onClose={() => !isRemoving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>{t("settings.providers.removeDialog.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2">
            {t("settings.providers.removeDialog.description", { provider: providerName })}
          </Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isRemoving}>
          {t("settings.providers.actions.cancel")}
        </Button>
        <Button variant="contained" color="error" onClick={handleRemove} disabled={!provider || isRemoving}>
          {isRemoving ? t("settings.providers.dialog.removing") : t("settings.providers.removeDialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
