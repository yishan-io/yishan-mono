import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  NO_ACTIVE_WORKSPACE_LOGIN_ERROR,
  openPiProviderLogin,
  savePiProvider,
} from "../../commands/piProviderCommands";
import { PI_PROVIDER_CATALOG } from "../../providers/piProviders";
import {
  type ProviderCredentialCatalogEntry,
  ProviderCredentialDialog,
  type ProviderCredentialDialogMode,
  type ProviderCredentialSaveInput,
} from "./ProviderCredentialDialog";

const PI_CREDENTIAL_PROVIDERS: ProviderCredentialCatalogEntry[] = PI_PROVIDER_CATALOG.map((provider) => ({
  id: provider.id,
  displayName: provider.name,
  authMode: provider.authMode === "api_key" ? "api-key" : provider.authMode,
  envVar: provider.envVar,
  envVars: provider.envVars,
  hasSubscription: provider.hasSubscription,
}));

type PiProviderCredentialDialogProps = {
  open: boolean;
  mode: ProviderCredentialDialogMode;
  initialProviderId?: string;
  initialEnv?: Record<string, string>;
  storedEnvVars?: string[];
  onClose: () => void;
  onSaved: (providerId?: string) => void;
};

/** Connects shared credential presentation to Pi's auth.json and OAuth commands. */
export function PiProviderCredentialDialog({
  open,
  mode,
  initialProviderId,
  initialEnv,
  storedEnvVars,
  onClose,
  onSaved,
}: PiProviderCredentialDialogProps) {
  const { t } = useTranslation();
  const handleSave = useCallback(async ({ provider, key, env }: ProviderCredentialSaveInput) => {
    await savePiProvider(provider.id, key, env);
  }, []);
  const handleSignIn = useCallback(
    async (provider: ProviderCredentialCatalogEntry) => {
      try {
        await openPiProviderLogin({
          providerId: provider.id,
          tabTitle: t("settings.providers.dialog.loginTabTitle", { provider: provider.displayName }),
        });
      } catch (caughtError) {
        const rawMessage = getErrorMessage(caughtError);
        throw new Error(
          rawMessage === NO_ACTIVE_WORKSPACE_LOGIN_ERROR
            ? t("settings.providers.errors.noWorkspace")
            : t("settings.providers.errors.loginLaunchFailed", { message: rawMessage }),
        );
      }
    },
    [t],
  );

  return (
    <ProviderCredentialDialog
      open={open}
      mode={mode}
      providers={PI_CREDENTIAL_PROVIDERS}
      initialProviderId={initialProviderId}
      initialEnv={initialEnv}
      storedEnvVars={storedEnvVars}
      onClose={onClose}
      onSave={handleSave}
      onSignIn={handleSignIn}
      onSaved={onSaved}
    />
  );
}
