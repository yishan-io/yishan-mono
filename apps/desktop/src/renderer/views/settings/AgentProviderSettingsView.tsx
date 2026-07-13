import { Alert, Box, Button, Chip, CircularProgress, Divider, Stack } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuRefreshCw } from "react-icons/lu";
import { ModelAutocomplete } from "../../components/ModelAutocomplete";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import { useCommands } from "../../hooks/useCommands";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import { piRuntimeStore } from "../../store/settings/piRuntimeStore";
import { AgentProviderActionControl } from "./AgentProviderActionControl";
import {
  buildAgentProviderConfigGroups,
  buildAvailablePiModelOptionsForProvider,
  buildAvailablePiProviderOptions,
  getAgentProviderConfigEntryStatusKind,
  isAgentProviderConfigEntryConfigured,
  isAgentProviderConfiguredButUnavailable,
  isPiModelPatternAvailable,
} from "./agentProviderHelpers";

const PROVIDER_GROUP_KINDS = ["oauth", "api_key", "external"] as const;
const PROVIDER_SETTINGS_ANCHOR_ID = "agent-provider-settings";
const FOCUS_HIGHLIGHT_DURATION_MS = 1800;

type AgentProviderSettingsViewProps = {
  focusRequested?: boolean;
};

/** Renders Pi provider/model runtime status and controls under the Agents settings tab. */
export function AgentProviderSettingsView({ focusRequested = false }: AgentProviderSettingsViewProps) {
  const { t } = useTranslation();
  const [isFocusHighlighted, setIsFocusHighlighted] = useState(false);
  const {
    getPiRuntimeSnapshot,
    refreshPiRuntime,
    authenticatePiProvider,
    cancelPiProviderAuthentication,
    removePiProviderCredential,
    setDefaultPiModelPattern,
    setDefaultPiProviderId,
  } = useCommands();
  const snapshot = piRuntimeStore((state) => state.snapshot);
  const loadState = piRuntimeStore((state) => state.loadState);
  const errorMessage = piRuntimeStore((state) => state.errorMessage);
  const pendingCredentialAction = piRuntimeStore((state) => state.pendingCredentialAction);
  const defaultPiProviderId = agentSettingsStore((state) => state.defaultPiProviderId);
  const defaultPiModelPattern = agentSettingsStore((state) => state.defaultPiModelPattern);

  useEffect(() => {
    void getPiRuntimeSnapshot();
  }, [getPiRuntimeSnapshot]);

  useEffect(() => {
    if (!focusRequested) {
      return;
    }

    const targetElement = document.getElementById(PROVIDER_SETTINGS_ANCHOR_ID);
    if (!targetElement) {
      return;
    }

    targetElement.scrollIntoView({ block: "start", behavior: "smooth" });
    setIsFocusHighlighted(true);

    const timeoutId = window.setTimeout(() => {
      setIsFocusHighlighted(false);
    }, FOCUS_HIGHLIGHT_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [focusRequested]);

  const providerGroups = useMemo(
    () => buildAgentProviderConfigGroups(snapshot?.providers ?? []),
    [snapshot?.providers],
  );
  const providerOptions = useMemo(() => buildAvailablePiProviderOptions(snapshot?.models ?? []), [snapshot?.models]);
  const hasAvailableDefaultPiProvider = providerOptions.some((provider) => provider.id === defaultPiProviderId);
  const selectedProviderId = hasAvailableDefaultPiProvider ? (defaultPiProviderId ?? "") : "";
  const modelOptions = useMemo(
    () => buildAvailablePiModelOptionsForProvider(snapshot?.models ?? [], selectedProviderId || undefined),
    [selectedProviderId, snapshot?.models],
  );
  const hasAvailableDefaultPiModel = useMemo(
    () => isPiModelPatternAvailable(snapshot?.models ?? [], defaultPiModelPattern),
    [defaultPiModelPattern, snapshot?.models],
  );

  const isLoading = loadState === "loading";
  const isRefreshing = loadState === "refreshing";
  const hasPendingCredentialAction = pendingCredentialAction !== undefined;

  return (
    <Box
      id={PROVIDER_SETTINGS_ANCHOR_ID}
      data-testid="agent-provider-settings-panel"
      data-focus-highlighted={isFocusHighlighted ? "true" : "false"}
      sx={{
        scrollMarginTop: 3,
        borderRadius: 1,
        backgroundColor: isFocusHighlighted ? "action.hover" : "transparent",
        transition: "background-color 220ms ease",
      }}
    >
      <SettingsSectionHeader
        title={t("settings.agentProviders.title")}
        description={t("settings.agentProviders.description")}
        action={
          <Button
            size="small"
            variant="text"
            onClick={() => {
              void refreshPiRuntime();
            }}
            disabled={isRefreshing}
            startIcon={isRefreshing || isLoading ? <CircularProgress size={14} /> : <LuRefreshCw />}
          >
            {t("settings.agentProviders.actions.refresh")}
          </Button>
        }
      />

      <Stack spacing={2}>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        {snapshot?.modelsLoadError ? <Alert severity="warning">{snapshot.modelsLoadError}</Alert> : null}

        {snapshot?.providers.length ? (
          <Box data-testid="provider-config-card">
            <SettingsCard>
              <Stack divider={<Divider flexItem />}>
                {PROVIDER_GROUP_KINDS.map((groupKind) => {
                  const entries = providerGroups[groupKind];
                  if (entries.length === 0) {
                    return null;
                  }
                  return (
                    <Box key={groupKind} data-testid={`provider-config-section-${groupKind}`} sx={{ py: 1 }}>
                      <SettingsRows>
                        {entries.map((entry) => {
                          const { provider, method } = entry;
                          const statusKind = getAgentProviderConfigEntryStatusKind(entry);
                          const isConfigured = isAgentProviderConfigEntryConfigured(entry);
                          const isPendingCredentialAction =
                            pendingCredentialAction?.kind === "authenticate" &&
                            pendingCredentialAction.providerId === provider.id &&
                            pendingCredentialAction.method === method.kind;
                          const configuredButUnavailable =
                            isConfigured && isAgentProviderConfiguredButUnavailable(provider);
                          const showConfigurationStatus = isConfigured || method.kind === "external";
                          return (
                            <SettingsControlRow
                              key={`${provider.id}:${method.kind}`}
                              title={method.kind === "external" ? provider.name : method.label}
                              description={
                                showConfigurationStatus
                                  ? t(`settings.agentProviders.providers.status.${statusKind}`)
                                  : undefined
                              }
                              control={
                                <Stack direction="row" spacing={1} alignItems="center">
                                  {showConfigurationStatus ? (
                                    <Chip
                                      size="small"
                                      color={
                                        configuredButUnavailable
                                          ? "warning"
                                          : isConfigured && provider.available
                                            ? "success"
                                            : "default"
                                      }
                                      variant={isConfigured ? "filled" : "outlined"}
                                      label={t(
                                        `settings.agentProviders.providers.badges.${configuredButUnavailable ? "configuredUnavailable" : statusKind}`,
                                      )}
                                    />
                                  ) : null}
                                  <AgentProviderActionControl
                                    provider={provider}
                                    method={method}
                                    disabled={hasPendingCredentialAction}
                                    pending={isPendingCredentialAction}
                                    onAuthenticate={(input) => {
                                      void authenticatePiProvider(input);
                                    }}
                                    onCancelAuthentication={(providerId) => {
                                      void cancelPiProviderAuthentication(providerId);
                                    }}
                                    onRemoveCredential={(providerId) => {
                                      void removePiProviderCredential(providerId);
                                    }}
                                  />
                                </Stack>
                              }
                            />
                          );
                        })}
                      </SettingsRows>
                    </Box>
                  );
                })}
              </Stack>
            </SettingsCard>
          </Box>
        ) : (
          <SettingsCard>
            <Box sx={{ py: 1, typography: "body2", color: "text.secondary" }}>
              {t("settings.agentProviders.providers.empty")}
            </Box>
          </SettingsCard>
        )}

        <Box>
          <SettingsSectionHeader
            title={t("settings.agentProviders.models.selectionTitle")}
            description={t("settings.agentProviders.models.selectionDescription")}
          />
          <SettingsCard>
            <SettingsRows>
              <SettingsControlRow
                title={t("settings.agentProviders.models.providerTitle")}
                description={t("settings.agentProviders.models.providerDescription")}
                control={
                  <Box sx={{ minWidth: 300, maxWidth: 360 }}>
                    <ModelAutocomplete
                      options={providerOptions}
                      value={selectedProviderId}
                      onChange={(providerId) => {
                        setDefaultPiProviderId(providerId);
                      }}
                      loading={isLoading || isRefreshing}
                      disabled={providerOptions.length === 0}
                      placeholder={t("settings.agentProviders.models.providerPlaceholder")}
                      noOptionsText={t("settings.agentProviders.models.providerEmpty")}
                      allowCustomValue={false}
                    />
                  </Box>
                }
              />
              <SettingsControlRow
                title={t("settings.agentProviders.models.defaultTitle")}
                description={t("settings.agentProviders.models.defaultDescription")}
                control={
                  <Box sx={{ minWidth: 300, maxWidth: 360 }}>
                    <ModelAutocomplete
                      options={modelOptions}
                      value={hasAvailableDefaultPiModel ? (defaultPiModelPattern ?? "") : ""}
                      onChange={(pattern) => {
                        setDefaultPiModelPattern(pattern);
                      }}
                      loading={isLoading || isRefreshing}
                      disabled={!selectedProviderId || modelOptions.length === 0}
                      placeholder={t("settings.agentProviders.models.placeholder")}
                      noOptionsText={t("settings.agentProviders.models.empty")}
                      allowCustomValue={false}
                    />
                  </Box>
                }
              />
            </SettingsRows>
          </SettingsCard>
        </Box>

        {(defaultPiProviderId && !hasAvailableDefaultPiProvider) ||
        (defaultPiModelPattern && !hasAvailableDefaultPiModel) ? (
          <Alert severity="warning">{t("settings.agentProviders.models.unavailableWarning")}</Alert>
        ) : null}
      </Stack>
    </Box>
  );
}
