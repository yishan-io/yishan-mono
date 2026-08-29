import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuLogIn } from "react-icons/lu";
import { ProviderMark } from "../../ui/ProviderMark";

export type ProviderCredentialDialogMode = "add" | "edit";
export type ProviderCredentialAuthMode = "api-key" | "oauth" | "both" | "ambient";

/** Provider metadata needed to select a credential setup method. */
export type ProviderCredentialCatalogEntry = {
  id: string;
  displayName: string;
  authMode: ProviderCredentialAuthMode;
  envVar?: string;
  envVars?: string[];
  hasSubscription?: boolean;
  setupGuidance?: string;
  credentialRef?: string;
};

/** A credential value normalized by the shared provider form. */
export type ProviderCredentialSaveInput = {
  provider: ProviderCredentialCatalogEntry;
  key: string;
  env?: Record<string, string>;
};

type ProviderCredentialDialogProps = {
  open: boolean;
  mode: ProviderCredentialDialogMode;
  providers: ProviderCredentialCatalogEntry[];
  initialProviderId?: string;
  initialEnv?: Record<string, string>;
  storedEnvVars?: string[];
  emptyMessage?: string;
  onClose: () => void;
  onSave: (input: ProviderCredentialSaveInput) => Promise<void>;
  onSignIn?: (provider: ProviderCredentialCatalogEntry) => Promise<void>;
  onSaved: (providerId?: string) => void;
};

/** Presents provider selection and credential input; runtime adapters own storage and OAuth commands. */
export function ProviderCredentialDialog({
  open,
  mode,
  providers,
  initialProviderId,
  initialEnv,
  storedEnvVars,
  emptyMessage,
  onClose,
  onSave,
  onSignIn,
  onSaved,
}: ProviderCredentialDialogProps) {
  const { t } = useTranslation();
  const [providerId, setProviderId] = useState(initialProviderId ?? "");
  const [key, setKey] = useState("");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setProviderId(initialProviderId ?? "");
    setKey("");
    setEnvValues(initialEnv ?? {});
    setError(null);
    setIsSaving(false);
    setIsSigningIn(false);
  }, [open, initialEnv, initialProviderId]);

  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const canUseApiKey = selectedProvider?.authMode === "api-key" || selectedProvider?.authMode === "both";
  const canSignInAccount =
    onSignIn !== undefined && (selectedProvider?.authMode === "oauth" || selectedProvider?.authMode === "both");
  const isSubscription = selectedProvider?.hasSubscription === true;
  const isEdit = mode === "edit";
  const trimmedKey = key.trim();
  const envVars = selectedProvider?.envVars ?? [];
  const hasEnvValue = envVars.some((name) => (envValues[name]?.trim().length ?? 0) > 0);
  const storedEnvNames = isEdit && storedEnvVars && storedEnvVars.length > 0 ? storedEnvVars : undefined;

  const handleSave = async () => {
    if (!selectedProvider || !canUseApiKey || isSaving || (!trimmedKey && !hasEnvValue)) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const env = envVars.reduce<Record<string, string>>((credentials, name) => {
        const value = envValues[name]?.trim();
        if (value) {
          credentials[name] = value;
        }
        return credentials;
      }, {});
      await onSave({ provider: selectedProvider, key: trimmedKey, env: Object.keys(env).length > 0 ? env : undefined });
      onSaved(selectedProvider.id);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setIsSaving(false);
    }
  };

  const handleSignIn = async () => {
    if (!selectedProvider || !canSignInAccount || isSigningIn || !onSignIn) {
      return;
    }
    setIsSigningIn(true);
    setError(null);
    try {
      await onSignIn(selectedProvider);
      onSaved(selectedProvider.id);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setIsSigningIn(false);
    }
  };

  const handleClose = () => {
    if (!isSaving && !isSigningIn) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEdit ? t("settings.providers.dialog.editTitle") : t("settings.providers.dialog.addTitle")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {t("settings.providers.dialog.providerLabel")}
            </Typography>
            <TextField
              select
              fullWidth
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              disabled={isEdit}
              aria-label={t("settings.providers.dialog.providerLabel")}
              slotProps={{
                select: {
                  renderValue: (selected) => {
                    const selectedProvider = providers.find((provider) => provider.id === selected);
                    return selectedProvider ? (
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                        <ProviderMark providerId={selectedProvider.id} size={16} />
                        <Box component="span">{selectedProvider.displayName}</Box>
                      </Box>
                    ) : null;
                  },
                },
              }}
            >
              {providers.map((provider) => (
                <MenuItem key={provider.id} value={provider.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                      <ProviderMark providerId={provider.id} size={16} />
                      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {provider.displayName}
                      </Box>
                    </Box>
                    {provider.hasSubscription ? (
                      <Box sx={{ ml: "auto", flexShrink: 0 }}>
                        <Chip size="small" variant="outlined" label={t("settings.providers.dialog.subscriptionTag")} />
                      </Box>
                    ) : null}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
            {selectedProvider?.authMode === "oauth" ? (
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                {t("settings.providers.dialog.oauthOnlyHint")}
              </Typography>
            ) : null}
            {selectedProvider?.authMode === "both" ? (
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                {t("settings.providers.dialog.subscriptionHint")}
              </Typography>
            ) : null}
            {selectedProvider?.setupGuidance ? (
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                {selectedProvider.setupGuidance}
              </Typography>
            ) : null}
            {providers.length === 0 && emptyMessage ? (
              <Typography variant="body2" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                {emptyMessage}
              </Typography>
            ) : null}
          </Box>
          {canUseApiKey ? (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {t("settings.providers.dialog.keyLabel")}
              </Typography>
              <TextField
                autoFocus={!isEdit}
                fullWidth
                type="password"
                placeholder={t("settings.providers.dialog.keyPlaceholder")}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                aria-label={t("settings.providers.dialog.keyLabel")}
                error={trimmedKey.length > 0 && trimmedKey.length < 4}
                helperText={
                  trimmedKey.length === 0
                    ? t("settings.providers.dialog.keyRequired")
                    : isEdit
                      ? t("settings.providers.dialog.editKeyHelper")
                      : undefined
                }
              />
            </Box>
          ) : null}
          {selectedProvider?.envVar ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("settings.providers.dialog.envVarHint", { envVar: selectedProvider.envVar })}
            </Typography>
          ) : null}
          {envVars.length > 0 ? (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {t("settings.providers.dialog.envSection")}
              </Typography>
              {storedEnvNames ? (
                <Typography variant="caption" sx={{ color: "warning.main", display: "block", mb: 1 }}>
                  {t("settings.providers.dialog.envStoredWarning", { names: storedEnvNames.join(", ") })}
                </Typography>
              ) : null}
              {envVars.map((name) => (
                <TextField
                  key={name}
                  fullWidth
                  size="small"
                  sx={{ mb: 1 }}
                  placeholder={name}
                  value={envValues[name] ?? ""}
                  onChange={(event) =>
                    setEnvValues((previousValues) => ({ ...previousValues, [name]: event.target.value }))
                  }
                  aria-label={`${t("settings.providers.dialog.envSection")} ${name}`}
                />
              ))}
            </Box>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSaving || isSigningIn}>
          {t("settings.providers.actions.cancel")}
        </Button>
        {canSignInAccount ? (
          <Button
            variant={canUseApiKey ? "outlined" : "contained"}
            startIcon={<LuLogIn />}
            onClick={handleSignIn}
            disabled={!providerId || isSaving || isSigningIn}
          >
            {isSigningIn
              ? t("settings.providers.dialog.openingSignIn")
              : isSubscription
                ? t("settings.providers.dialog.signInWithSubscription")
                : t("settings.providers.dialog.signInWithAccount")}
          </Button>
        ) : null}
        {canUseApiKey ? (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!providerId || (!trimmedKey && !hasEnvValue) || isSaving || isSigningIn}
          >
            {isSaving ? t("settings.providers.dialog.saving") : t("settings.providers.actions.save")}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
