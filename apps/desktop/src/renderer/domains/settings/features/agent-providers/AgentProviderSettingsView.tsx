import { Alert, Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { ProviderMark } from "@renderer/domains/agent";
import { ProviderCredentialDialog, listPiProviders } from "@renderer/domains/agent";
import { getPiProviderDisplayName, getPiProviderPinEnv } from "@renderer/domains/agent";
import type { PiProviderStatus } from "@renderer/domains/agent";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuPencil, LuPin, LuPlus, LuTrash2 } from "react-icons/lu";
import { useRefreshableLoader } from "../../../../ui/hooks/useRefreshableLoader";
import { RemoveProviderDialog } from "./RemoveProviderDialog";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../ui/controls";

type ProviderCredentialDialogTarget = {
  mode: "add" | "edit";
  provider?: string;
  initialEnv?: Record<string, string>;
  storedEnvVars?: string[];
};

const PROVIDER_LIST_TIMEOUT_MS = 10_000;

function ProviderRow({
  entry,
  onEdit,
  onRemove,
  onPin,
}: {
  entry: PiProviderStatus;
  onEdit: () => void;
  onRemove: () => void;
  onPin: () => void;
}) {
  const { t } = useTranslation();
  const isAmbient = entry.type === "ambient";
  const canPin = isAmbient && getPiProviderPinEnv(entry.provider, entry.source) !== null;
  const canEdit = entry.type === "api_key" || entry.type === "env";
  const typeLabel =
    entry.type === "api_key"
      ? t("settings.providers.credentialType.apiKey")
      : entry.type === "oauth"
        ? t("settings.providers.credentialType.oauth")
        : isAmbient || entry.type === "env"
          ? t("settings.providers.credentialType.ambient")
          : entry.type || t("settings.providers.credentialType.unknown");

  const typeChip = entry.source ? (
    <Tooltip title={entry.source}>
      <Chip size="small" variant="outlined" label={typeLabel} />
    </Tooltip>
  ) : (
    <Chip size="small" variant="outlined" label={typeLabel} />
  );

  return (
    <SettingsControlRow
      title={
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          <ProviderMark providerId={entry.provider} size={18} />
          <Box component="span">{getPiProviderDisplayName(entry.provider)}</Box>
        </Box>
      }
      control={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          {typeChip}
          {canEdit ? (
            <Tooltip title={t("settings.providers.actions.edit")}>
              <IconButton
                size="small"
                onClick={onEdit}
                aria-label={`${t("settings.providers.actions.edit")} ${getPiProviderDisplayName(entry.provider)}`}
              >
                <LuPencil size={14} />
              </IconButton>
            </Tooltip>
          ) : null}
          {canPin ? (
            <Tooltip title={t("settings.providers.actions.pin")}>
              <IconButton
                size="small"
                onClick={onPin}
                aria-label={`${t("settings.providers.actions.pin")} ${getPiProviderDisplayName(entry.provider)}`}
              >
                <LuPin size={14} />
              </IconButton>
            </Tooltip>
          ) : null}
          {!isAmbient ? (
            <Tooltip title={t("settings.providers.actions.remove")}>
              <IconButton
                size="small"
                onClick={onRemove}
                aria-label={`${t("settings.providers.actions.remove")} ${getPiProviderDisplayName(entry.provider)}`}
              >
                <LuTrash2 size={14} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Stack>
      }
    />
  );
}

/** Renders providers registered in the yishan pi agent with add/edit/remove. */
export function AgentProviderSettingsView() {
  const { t } = useTranslation();
  const [credentialTarget, setCredentialTarget] = useState<ProviderCredentialDialogTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PiProviderStatus | null>(null);

  const fetchProviders = useCallback(() => listPiProviders(), [listPiProviders]);
  const {
    data: providers,
    isLoading,
    hasLoadError,
    refresh,
  } = useRefreshableLoader({
    fetch: fetchProviders,
    timeoutMs: PROVIDER_LIST_TIMEOUT_MS,
  });

  const handleSaved = () => {
    setCredentialTarget(null);
    refresh();
  };

  const handleRemoved = () => {
    setRemoveTarget(null);
    refresh();
  };

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.providers.title")}
        description={t("settings.providers.description")}
        action={
          <Button
            size="small"
            variant="text"
            startIcon={<LuPlus />}
            onClick={() => setCredentialTarget({ mode: "add" })}
            disabled={isLoading}
          >
            {t("settings.providers.actions.add")}
          </Button>
        }
      />
      <SettingsCard>
        {hasLoadError ? (
          <Alert severity="error">{t("settings.providers.loadError")}</Alert>
        ) : providers && providers.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", py: 1 }}>
            {t("settings.providers.empty")}
          </Typography>
        ) : (
          <SettingsRows>
            {(providers ?? [])
              .slice()
              .sort((left, right) =>
                getPiProviderDisplayName(left.provider).localeCompare(getPiProviderDisplayName(right.provider)),
              )
              .map((entry) => (
                <ProviderRow
                  key={entry.provider}
                  entry={entry}
                  onEdit={() =>
                    setCredentialTarget({
                      mode: "edit",
                      provider: entry.provider,
                      storedEnvVars: entry.envVars,
                    })
                  }
                  onRemove={() => setRemoveTarget(entry)}
                  onPin={() =>
                    setCredentialTarget({
                      mode: "add",
                      provider: entry.provider,
                      initialEnv: getPiProviderPinEnv(entry.provider, entry.source) ?? undefined,
                    })
                  }
                />
              ))}
          </SettingsRows>
        )}
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
          {t("settings.providers.appliesToNewSessions")}
        </Typography>
      </SettingsCard>
      <ProviderCredentialDialog
        open={credentialTarget !== null}
        mode={credentialTarget?.mode ?? "add"}
        initialProviderId={credentialTarget?.provider}
        initialEnv={credentialTarget?.initialEnv}
        storedEnvVars={credentialTarget?.storedEnvVars}
        onClose={() => setCredentialTarget(null)}
        onSaved={handleSaved}
      />
      <RemoveProviderDialog
        open={removeTarget !== null}
        provider={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onRemoved={handleRemoved}
      />
    </Box>
  );
}
