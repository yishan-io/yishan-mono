import { Button, CircularProgress, Menu, MenuItem } from "@mui/material";
import { type MouseEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AuthenticatePiProviderInput,
  PiProviderAuthMethod,
  PiProviderAuthMethodKind,
  PiProviderRecord,
} from "../../../shared/contracts/piProviderConfig";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { getAiChatProviderConfigEntryAction } from "./aiChatProviderHelpers";

type AiChatProviderActionControlProps = {
  provider: PiProviderRecord;
  method: PiProviderAuthMethod;
  disabled: boolean;
  pending: boolean;
  onAuthenticate: (input: AuthenticatePiProviderInput) => void;
  onCancelAuthentication: (providerId: string) => void;
  onRemoveCredential: (providerId: string) => void;
};

/** Renders source-safe provider actions without owning runtime I/O. */
export function AiChatProviderActionControl({
  provider,
  method,
  disabled,
  pending,
  onAuthenticate,
  onCancelAuthentication,
  onRemoveCredential,
}: AiChatProviderActionControlProps) {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const action = getAiChatProviderConfigEntryAction({ provider, method });

  if (!action) {
    return null;
  }

  if (pending && method.kind === "oauth") {
    return (
      <Button
        size="small"
        variant="outlined"
        onClick={() => onCancelAuthentication(provider.id)}
        startIcon={<CircularProgress size={14} />}
      >
        {t("settings.aiChatProviders.providers.actions.cancel")}
      </Button>
    );
  }

  const authenticate = (method: PiProviderAuthMethodKind) => {
    setMenuAnchor(null);
    onAuthenticate({ providerId: provider.id, method });
  };
  const openMenu = (event: MouseEvent<HTMLButtonElement>) => setMenuAnchor(event.currentTarget);
  const closeMenu = () => setMenuAnchor(null);

  if (action.kind === "authenticate") {
    const actionKey = action.method === "oauth" ? "login" : "setApiKey";
    const requiresSwitchConfirmation = provider.hasAuth;
    return (
      <>
        <Button
          size="small"
          variant="outlined"
          disabled={disabled}
          onClick={() => {
            if (requiresSwitchConfirmation) {
              setIsSwitchDialogOpen(true);
            } else {
              authenticate(action.method);
            }
          }}
          startIcon={pending ? <CircularProgress size={14} /> : undefined}
        >
          {t(`settings.aiChatProviders.providers.actions.${actionKey}`)}
        </Button>
        <ConfirmationDialog
          open={isSwitchDialogOpen}
          title={t("settings.aiChatProviders.providers.switchDialog.title")}
          description={t("settings.aiChatProviders.providers.switchDialog.description", { provider: provider.name })}
          confirmLabel={t("settings.aiChatProviders.providers.switchDialog.confirm")}
          cancelLabel={t("common.actions.cancel")}
          onCancel={() => setIsSwitchDialogOpen(false)}
          onConfirm={() => {
            setIsSwitchDialogOpen(false);
            authenticate(action.method);
          }}
        />
      </>
    );
  }

  if (action.kind === "manageOauth") {
    return (
      <Button size="small" variant="outlined" disabled={disabled} onClick={() => onRemoveCredential(provider.id)}>
        {t("settings.aiChatProviders.providers.actions.logout")}
      </Button>
    );
  }

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        disabled={disabled}
        onClick={openMenu}
        startIcon={pending ? <CircularProgress size={14} /> : undefined}
      >
        {t("settings.aiChatProviders.providers.actions.manage")}
      </Button>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={() => authenticate("api_key")}>
          {t("settings.aiChatProviders.providers.actions.replace")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            onRemoveCredential(provider.id);
          }}
        >
          {t("settings.aiChatProviders.providers.actions.remove")}
        </MenuItem>
      </Menu>
    </>
  );
}
