import { Button, CircularProgress, Menu, MenuItem } from "@mui/material";
import { type MouseEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AuthenticatePiProviderInput,
  PiProviderAuthMethod,
  PiProviderAuthMethodKind,
  PiRuntimeProviderRecord,
} from "../../../main/piRuntime/piRuntimeTypes";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { getAgentProviderConfigEntryAction } from "./agentProviderHelpers";

type AgentProviderActionControlProps = {
  provider: PiRuntimeProviderRecord;
  method: PiProviderAuthMethod;
  disabled: boolean;
  pending: boolean;
  onAuthenticate: (input: AuthenticatePiProviderInput) => void;
  onCancelAuthentication: (providerId: string) => void;
  onRemoveCredential: (providerId: string) => void;
};

/** Renders source-safe provider actions without owning runtime I/O. */
export function AgentProviderActionControl({
  provider,
  method,
  disabled,
  pending,
  onAuthenticate,
  onCancelAuthentication,
  onRemoveCredential,
}: AgentProviderActionControlProps) {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const action = getAgentProviderConfigEntryAction({ provider, method });

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
        {t("settings.agentProviders.providers.actions.cancel")}
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
    const requiresSwitchConfirmation =
      provider.hasAuth && (provider.authSource === "oauth" || provider.authSource === "auth_file");
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
          {t(`settings.agentProviders.providers.actions.${actionKey}`)}
        </Button>
        <ConfirmationDialog
          open={isSwitchDialogOpen}
          title={t("settings.agentProviders.providers.switchDialog.title")}
          description={t("settings.agentProviders.providers.switchDialog.description", { provider: provider.name })}
          confirmLabel={t("settings.agentProviders.providers.switchDialog.confirm")}
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
        {t("settings.agentProviders.providers.actions.logout")}
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
        {t("settings.agentProviders.providers.actions.manage")}
      </Button>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {action.kind === "manageApiKey" ? (
          <MenuItem onClick={() => authenticate("api_key")}>
            {t("settings.agentProviders.providers.actions.replace")}
          </MenuItem>
        ) : null}
        {action.kind === "manageApiKey" ? (
          <MenuItem
            onClick={() => {
              closeMenu();
              onRemoveCredential(provider.id);
            }}
          >
            {t("settings.agentProviders.providers.actions.remove")}
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}
