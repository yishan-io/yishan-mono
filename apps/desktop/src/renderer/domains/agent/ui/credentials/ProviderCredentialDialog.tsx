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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuLogIn } from "react-icons/lu";
import { getErrorMessage } from "../../../../helpers/errorHelpers";
import { openPiProviderLogin, savePiProvider } from "../../commands/piProviderCommands";
import { NO_ACTIVE_WORKSPACE_LOGIN_ERROR } from "../../commands/piProviderCommands";
import { ProviderMark } from "../../features/model-picker/ProviderMark";
import {
  PI_PROVIDER_CATALOG,
  getPiProviderCatalogEntry,
  getPiProviderDisplayName,
  isPiProviderApiKeyCapable,
  isPiProviderOAuthCapable,
  isPiProviderSubscriptionCapable,
} from "../../model/piProviders";

export type ProviderCredentialDialogMode = "add" | "edit";

export function ProviderCredentialDialog({
  open,
  mode,
  initialProviderId,
  initialEnv,
  storedEnvVars,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: ProviderCredentialDialogMode;
  initialProviderId?: string;
  initialEnv?: Record<string, string>;
  storedEnvVars?: string[];
  onClose: () => void;
  onSaved: (providerId?: string) => void;
}) {
  const { t } = useTranslation();

  const [providerId, setProviderId] = useState(initialProviderId ?? "");
  const [key, setKey] = useState("");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProviderId(initialProviderId ?? "");
      setKey("");
      setEnvValues(initialEnv ?? {});
      setError(null);
      setIsSaving(false);
      setIsSigningIn(false);
    }
  }, [open, initialProviderId, initialEnv]);

  const selectedEntry = getPiProviderCatalogEntry(providerId);
  const canUseApiKey = isPiProviderApiKeyCapable(providerId);
  const canSignInAccount = isPiProviderOAuthCapable(providerId);
  const isSubscription = isPiProviderSubscriptionCapable(providerId);
  const isEdit = mode === "edit";
  const trimmedKey = key.trim();
  const envVars = selectedEntry?.envVars ?? [];
  const hasEnvValue = envVars.some((name) => {
    const value = envValues[name];
    return value !== undefined && value.trim().length > 0;
  });
  const storedEnvNames = isEdit && storedEnvVars && storedEnvVars.length > 0 ? storedEnvVars : undefined;

  const handleSave = async () => {
    if (!providerId || isSaving) {
      return;
    }
    if (!trimmedKey && !hasEnvValue) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const env = envVars.reduce<Record<string, string>>((acc, name) => {
        const value = envValues[name]?.trim();
        if (value) {
          acc[name] = value;
        }
        return acc;
      }, {});
      await savePiProvider(providerId, trimmedKey, Object.keys(env).length > 0 ? env : undefined);
      onSaved(providerId);
    } catch (err) {
      setError(getErrorMessage(err));
      setIsSaving(false);
    }
  };

  const handleSignIn = async () => {
    if (!providerId || isSigningIn) {
      return;
    }
    setIsSigningIn(true);
    setError(null);
    try {
      const tabTitle = t("settings.providers.dialog.loginTabTitle", {
        provider: getPiProviderDisplayName(providerId),
      });
      await openPiProviderLogin({ providerId, tabTitle });
      onSaved(providerId);
    } catch (err) {
      const rawMessage = getErrorMessage(err);
      setError(
        rawMessage === NO_ACTIVE_WORKSPACE_LOGIN_ERROR
          ? t("settings.providers.errors.noWorkspace")
          : t("settings.providers.errors.loginLaunchFailed", { message: rawMessage }),
      );
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
                    return (
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                        <ProviderMark providerId={selected as string} size={16} />
                        <Box component="span">{getPiProviderDisplayName(selected as string)}</Box>
                      </Box>
                    );
                  },
                },
              }}
            >
              {PI_PROVIDER_CATALOG.map((entry) => {
                const isSubscription = isPiProviderSubscriptionCapable(entry.id);
                return (
                  <MenuItem key={entry.id} value={entry.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                        <ProviderMark providerId={entry.id} size={16} />
                        <Box
                          component="span"
                          sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {entry.name}
                        </Box>
                      </Box>
                      {isSubscription ? (
                        <Box sx={{ ml: "auto", flexShrink: 0 }}>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={t("settings.providers.dialog.subscriptionTag")}
                          />
                        </Box>
                      ) : null}
                    </Box>
                  </MenuItem>
                );
              })}
            </TextField>
            {selectedEntry?.authMode === "oauth" ? (
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                {t("settings.providers.dialog.oauthOnlyHint")}
              </Typography>
            ) : null}
            {selectedEntry?.authMode === "both" ? (
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                {t("settings.providers.dialog.subscriptionHint")}
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
          {selectedEntry?.envVar ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("settings.providers.dialog.envVarHint", { envVar: selectedEntry.envVar })}
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
                  label={name}
                  placeholder={name}
                  value={envValues[name] ?? ""}
                  onChange={(event) => setEnvValues((prev) => ({ ...prev, [name]: event.target.value }))}
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
