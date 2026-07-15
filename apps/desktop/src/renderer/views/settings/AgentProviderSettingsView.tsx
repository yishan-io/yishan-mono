import { Alert, Box, Button, Chip, CircularProgress, Stack } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuRefreshCw } from "react-icons/lu";
import { ModelAutocomplete } from "../../components/ModelAutocomplete";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import {
  formatAiChatModelSelection,
  isAiChatModelSelectionAvailable,
  parseAiChatModelSelection,
} from "../../helpers/aiChatSettings";
import { useCommands } from "../../hooks/useCommands";
import { aiChatSettingsStore } from "../../store/settings/aiChatSettingsStore";
import { piRuntimeStore } from "../../store/settings/piRuntimeStore";
import { AgentProviderActionControl } from "./AgentProviderActionControl";
import {
  buildAgentProviderConfigEntries,
  buildAvailablePiModelOptionsForProvider,
  buildAvailablePiProviderOptions,
  getAgentProviderConfigEntryStatusKind,
  isAgentProviderConfigEntryConfigured,
  isAgentProviderConfiguredButUnavailable,
} from "./agentProviderHelpers";

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
    authenticatePiProvider,
    cancelPiProviderAuthentication,
    removePiProviderCredential,
    setDefaultAiChatModel,
  } = useCommands();
  const snapshot = piRuntimeStore((state) => state.snapshot);
  const loadState = piRuntimeStore((state) => state.loadState);
  const errorMessage = piRuntimeStore((state) => state.errorMessage);
  const pendingCredentialAction = piRuntimeStore((state) => state.pendingCredentialAction);
  const defaultModel = aiChatSettingsStore((state) => state.defaultModel);
  const savedDefaultProviderId = defaultModel?.providerId;
  const [selectedProviderId, setSelectedProviderId] = useState(savedDefaultProviderId ?? "");

  useEffect(() => {
    // fire-and-forget: the command owns load and error state for this initial snapshot request.
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

  const providerEntries = useMemo(
    () => buildAgentProviderConfigEntries(snapshot?.providers ?? []),
    [snapshot?.providers],
  );
  const providerOptions = useMemo(() => buildAvailablePiProviderOptions(snapshot?.models ?? []), [snapshot?.models]);
  const hasAvailableDefaultPiProvider = providerOptions.some((provider) => provider.id === savedDefaultProviderId);
  const hasAvailableSelectedProvider = providerOptions.some((provider) => provider.id === selectedProviderId);
  const activeSelectedProviderId = hasAvailableSelectedProvider ? selectedProviderId : "";
  const modelOptions = useMemo(
    () => buildAvailablePiModelOptionsForProvider(snapshot?.models ?? [], activeSelectedProviderId || undefined),
    [activeSelectedProviderId, snapshot?.models],
  );
  const hasAvailableDefaultPiModel = useMemo(
    () => isAiChatModelSelectionAvailable(snapshot?.models ?? [], defaultModel),
    [defaultModel, snapshot?.models],
  );

  useEffect(() => {
    if (savedDefaultProviderId && providerOptions.some((provider) => provider.id === savedDefaultProviderId)) {
      setSelectedProviderId(savedDefaultProviderId);
      return;
    }
    setSelectedProviderId((currentProviderId) =>
      providerOptions.some((provider) => provider.id === currentProviderId) ? currentProviderId : "",
    );
  }, [providerOptions, savedDefaultProviderId]);

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
              // fire-and-forget: the command exposes refresh progress and errors through piRuntimeStore.
              void getPiRuntimeSnapshot("refreshing");
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
              <SettingsRows>
                {providerEntries.map((entry) => {
                  const { provider, method } = entry;
                  const statusKind = getAgentProviderConfigEntryStatusKind(entry);
                  const isConfigured = isAgentProviderConfigEntryConfigured(entry);
                  const isPendingCredentialAction =
                    pendingCredentialAction?.kind === "authenticate" &&
                    pendingCredentialAction.providerId === provider.id &&
                    pendingCredentialAction.method === method.kind;
                  const configuredButUnavailable = isConfigured && isAgentProviderConfiguredButUnavailable(provider);
                  const showConfigurationStatus = statusKind !== undefined;
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
                              // fire-and-forget: the command owns the credential operation lifecycle.
                              void authenticatePiProvider(input);
                            }}
                            onCancelAuthentication={(providerId) => {
                              // fire-and-forget: cancellation settlement remains visible through pending state.
                              void cancelPiProviderAuthentication(providerId);
                            }}
                            onRemoveCredential={(providerId) => {
                              // fire-and-forget: the command owns mutation and refresh error reporting.
                              void removePiProviderCredential(providerId);
                            }}
                          />
                        </Stack>
                      }
                    />
                  );
                })}
              </SettingsRows>
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
                      value={activeSelectedProviderId}
                      onChange={(providerId) => {
                        setSelectedProviderId(providerId);
                        if (defaultModel && defaultModel.providerId !== providerId) {
                          setDefaultAiChatModel(undefined);
                        }
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
                      value={
                        defaultModel && hasAvailableDefaultPiModel
                          ? (formatAiChatModelSelection(defaultModel) ?? "")
                          : ""
                      }
                      onChange={(pattern) => {
                        setDefaultAiChatModel(parseAiChatModelSelection(pattern));
                      }}
                      loading={isLoading || isRefreshing}
                      disabled={!activeSelectedProviderId || modelOptions.length === 0}
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

        {(savedDefaultProviderId && !hasAvailableDefaultPiProvider) || (defaultModel && !hasAvailableDefaultPiModel) ? (
          <Alert severity="warning">{t("settings.agentProviders.models.unavailableWarning")}</Alert>
        ) : null}
      </Stack>
    </Box>
  );
}
